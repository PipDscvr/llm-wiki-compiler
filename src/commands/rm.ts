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
    output.status("x", output.error(`No source matches "${ref}". Look in sources/ for the filename.`));
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
  printPlan(plan, false, skipped);
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
 * @param skipped - Floor-skipped slugs from the apply (`[]` for `--dry-run`,
 *   which has no apply to report skips from). Passed through so the slug-list
 *   print never claims a skipped page was deleted — see {@link printSourceAndSlugs}.
 */
function printPlan(plan: RemovalPlan, prospective: boolean, skipped: SkippedDelete[] = []): void {
  const verb = prospective ? "Would delete" : "Deleted";
  printSourceAndSlugs(plan, verb, skipped);
  if (!prospective) printRegenerated(plan);
  printConsequences(plan);
}

/**
 * Print the source line and the per-slug delete/keep lines, using `verb` for
 * the deletions.
 *
 * `skipped` slugs are EXCLUDED from that loop: they failed the filename-safety
 * floor inside `deleteWikiPagesLocked` and are still on disk, so printing
 * "Deleted: <slug>" for one and then `reportSkipped` printing
 * "Not deleted: <slug> (...)" right after would contradict itself in the same
 * transcript — the one record a user gets, since `rm` has no confirmation
 * prompt.
 */
function printSourceAndSlugs(plan: RemovalPlan, verb: string, skipped: SkippedDelete[]): void {
  output.status("x", `${verb}: sources/${plan.sourceFile}`);
  const skippedSlugs = new Set(skipped.map((s) => s.slug));
  for (const slug of plan.deleteSlugs) {
    if (skippedSlugs.has(slug)) continue; // reportSkipped covers it as "Not deleted:"
    output.status("x", `${verb}: wiki/concepts/${slug}.md`);
  }
  for (const slug of plan.keptSlugs) {
    output.status("i", output.dim(`Kept: wiki/concepts/${slug}.md (shared with other sources)`));
  }
}

/**
 * Print the "regenerated derived artifacts" line, only when a page was
 * actually deleted.
 *
 * Deliberately says "index and MOC" only, never "and embeddings": the
 * embeddings step (`regenerateDerived` in `src/sources/removal.ts`) already
 * printed its own true outcome — success, a warning, or (under
 * `LLMWIKI_EMBED_STRICT`) a throw — earlier in this same command, BEFORE this
 * line runs. Claiming "and embeddings" here would restate that as a blanket
 * success and could directly contradict a warning the user just saw. (Wrapping
 * the embeddings step in `withQuiet` instead, as done for `acquireLock` in
 * `src/import/run.ts:145`, was considered and rejected: it would silence that
 * warning rather than fix the contradiction, and the warning is exactly what a
 * command with no confirmation prompt must not hide.) Index and MOC regen has
 * no failure mode to report, so asserting those two is still accurate.
 */
function printRegenerated(plan: RemovalPlan): void {
  if (plan.deleteSlugs.length > 0) {
    output.status("~", output.info("Regenerated index and MOC"));
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
