/**
 * @file src/commands/rm.ts
 * @description Commander action for `llmwiki rm <source>` — delete a source and
 * the concept pages derived exclusively from it.
 *
 * Two modes, matching the surface agreed on issue #60: a bare `rm` applies, and
 * `--dry-run` prints exactly what would be deleted and kept while taking no lock
 * and touching nothing. There is deliberately NO confirmation flag, which makes
 * two other things load-bearing rather than conveniences: `--dry-run` is the only
 * pre-flight check available, and the journalled page delete is the only recovery
 * path if the process dies mid-removal.
 *
 * Returns an exit code rather than calling `process.exit`, so the behaviour is
 * assertable without spawning a process (mirrors `statusCommand`).
 *
 * NO LLM PROVIDER is required: the CLI action must not call `requireProvider()`.
 */

import { planRemoval, applyRemovalLocked, type RemovalPlan } from "../sources/removal.js";
import type { SkippedDelete } from "../wiki/delete-page.js";
import { acquireLock, releaseLock } from "../utils/lock.js";
import * as output from "../utils/output.js";

/** Options for {@link rmCommand}. */
export interface RmOptions {
  /** Print the plan and exit without taking the lock or changing anything. */
  dryRun?: boolean;
}

/**
 * Run the removal.
 *
 * @param ref - The `<source>` argument: a basename, with or without `.md`.
 * @param options - Command flags.
 * @returns The process exit code (0 success, 1 refusal).
 */
export async function rmCommand(ref: string, options: RmOptions = {}): Promise<number> {
  const root = process.cwd();
  const plan = await planRemoval(root, ref);
  if (plan === null) {
    output.status("x", output.error(`No source matches "${ref}". Run \`llmwiki status\` to list sources.`));
    return 1;
  }

  if (options.dryRun) {
    printPlan(plan, true);
    return 0;
  }

  // Non-blocking: a compile holding the lock means refuse cleanly, never force.
  if (!(await acquireLock(root))) {
    output.status("x", output.error("Another llmwiki process holds the project lock. Try again when it finishes."));
    return 1;
  }
  let skipped: SkippedDelete[];
  try {
    ({ skipped } = await applyRemovalLocked(root, plan));
  } finally {
    await releaseLock(root);
  }
  printPlan(plan, false);
  return reportSkipped(skipped);
}

/**
 * Warn about each page the delete batch could not remove, and derive the exit
 * code from whether any were skipped. Split out of {@link rmCommand} to keep
 * its cyclomatic complexity down — a page that failed the filename floor is
 * still on disk, and saying so is the difference between "removed" and
 * "mostly removed"; never swallow it.
 *
 * @param skipped - Slugs the delete batch refused, with their skip reason.
 * @returns 1 if anything was skipped, 0 otherwise.
 */
function reportSkipped(skipped: SkippedDelete[]): number {
  for (const skip of skipped) {
    output.status("!", output.warn(`Not deleted: ${skip.slug} (${skip.reason})`));
  }
  return skipped.length > 0 ? 1 : 0;
}

/**
 * Print what the removal did, or would do.
 *
 * @param plan - The computed plan.
 * @param prospective - `true` for `--dry-run` wording, `false` once applied.
 */
function printPlan(plan: RemovalPlan, prospective: boolean): void {
  const verb = prospective ? "Would delete" : "Deleted";
  printSourceAndSlugs(plan, verb);
  if (!prospective) printRegenerated(plan);
  printConsequences(plan);
}

/** Print the source line and the per-slug delete/keep lines, using `verb` for the deletions. */
function printSourceAndSlugs(plan: RemovalPlan, verb: string): void {
  output.status("x", `${verb}: sources/${plan.sourceFile}`);
  for (const slug of plan.deleteSlugs) output.status("x", `${verb}: wiki/concepts/${slug}.md`);
  for (const slug of plan.keptSlugs) {
    output.status("i", output.dim(`Kept: wiki/concepts/${slug}.md (shared with other sources)`));
  }
}

/** Print the "regenerated derived artifacts" line, only when a page was actually deleted. */
function printRegenerated(plan: RemovalPlan): void {
  if (plan.deleteSlugs.length > 0) {
    output.status("~", output.info("Regenerated index, MOC and embeddings"));
  }
}

/** Warn about the two things `rm` reports but deliberately does not repair. */
function printConsequences(plan: RemovalPlan): void {
  if (plan.brokenLinks.length > 0) {
    output.status("!", output.warn(`${plan.brokenLinks.length} surviving page(s) link to a deleted page:`));
    for (const link of plan.brokenLinks) output.note(`${link.file} -> [[${link.target}]]`);
    output.note("Run `llmwiki lint` for detail.");
  }
  if (plan.candidateRefs.length > 0) {
    output.status("!", output.warn(`${plan.candidateRefs.length} pending review candidate(s) reference this source.`));
    output.note("Run `llmwiki review list`.");
  }
}
