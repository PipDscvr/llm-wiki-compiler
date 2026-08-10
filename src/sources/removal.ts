/**
 * @file src/sources/removal.ts
 * @description The I/O half of `llmwiki rm`: resolve a user-supplied ref to a
 * validated source basename, gather what the pure planner needs, and apply the
 * resulting plan under the project lock.
 *
 * The plan / dry-run / apply split mirrors `src/workflows/adapt.ts`:
 * {@link planRemoval} is READ-ONLY and takes NO lock, so `--dry-run` can print
 * exactly what would happen without any possibility of mutating the project;
 * {@link applyRemovalLocked} performs every mutation inside the caller's lock.
 *
 * ## Order is load-bearing
 *
 * `applyRemovalLocked` deletes the SOURCE FILE FIRST, before any page. A crash
 * at that point leaves source-gone / pages-present — precisely the state
 * `compile` already knows how to reconcile, by orphaning the now-unowned pages.
 * The reverse order would leave source-present / pages-gone, where `compile`
 * sees an unchanged source hash, does nothing, and the pages are gone for good.
 * A crash WITHIN the page batch is recovered by the journal itself.
 *
 * No LLM provider is required anywhere on this path: a removal has no new text
 * to embed, so the embeddings refresh only prunes.
 */

import { getSource, deleteSource } from "./store.js";
import { assertSafeSourceId } from "./source-record.js";
import { computeRemovalPlan, type RemovalPlan } from "./removal-plan.js";
import { deleteWikiPagesLocked, type SkippedDelete } from "../wiki/delete-page.js";
import { readState, writeState, removeSourceFrom } from "../utils/state.js";
import { collectAllPages } from "../linter/rules.js";
import { listCandidates } from "../compiler/candidate-read.js";
import { generateIndex } from "../compiler/indexgen.js";
import { generateMOC } from "../compiler/obsidian.js";
import { updateEmbeddingsLockedCore } from "../utils/embeddings.js";
import { handleSafeEmbeddingFailure } from "../utils/embeddings-batch.js";

export type { RemovalPlan } from "./removal-plan.js";

/**
 * Normalize a user-supplied `<source>` ref to a validated bare basename.
 *
 * `.md` is appended when absent, purely as ergonomics. Everything else — an
 * absent file, a path-unsafe ref (a URL contains `/`, so it fails here), a
 * symlinked or escaping entry — collapses to a single `null`, so the caller has
 * ONE "no such source" branch instead of a taxonomy. `assertSafeSourceId` throws
 * rather than returning false, so it is caught and folded into that same `null`.
 *
 * @param root - Absolute project root.
 * @param ref - The raw `<source>` argument.
 * @returns The validated basename, or `null` when no such source exists.
 */
export async function resolveSourceRef(root: string, ref: string): Promise<string | null> {
  const id = ref.endsWith(".md") ? ref : `${ref}.md`;
  try {
    assertSafeSourceId(id);
  } catch {
    return null;
  }
  return (await getSource(root, id)) === null ? null : id;
}

/**
 * READ-ONLY: resolve the ref and compute the plan. Takes NO lock and writes
 * nothing, so `--dry-run` is incapable of mutating the project.
 *
 * @param root - Absolute project root.
 * @param ref - The raw `<source>` argument.
 * @returns The plan, or `null` when the ref matches no source.
 */
export async function planRemoval(root: string, ref: string): Promise<RemovalPlan | null> {
  const sourceFile = await resolveSourceRef(root, ref);
  if (sourceFile === null) return null;
  const [state, pages, candidates] = await Promise.all([
    readState(root),
    collectAllPages(root),
    listCandidates(root),
  ]);
  return computeRemovalPlan({ sourceFile, state, pages, candidates });
}

/**
 * Apply a plan. PRECONDITION: the caller already holds the project lock.
 * See the file header for why the source file is deleted before the pages.
 *
 * @param root - Absolute project root.
 * @param plan - The plan produced by {@link planRemoval}.
 */
export async function applyRemovalLocked(
  root: string,
  plan: RemovalPlan,
): Promise<{ skipped: SkippedDelete[] }> {
  await deleteSource(root, plan.sourceFile);
  // Floor-skipped pages are RETURNED, never swallowed: compile surfaces its own
  // skips as errors (src/compiler/index.ts:225), and a page the user asked to
  // remove that silently stayed on disk is exactly the failure `rm` exists to
  // prevent.
  const { skipped } = await deleteWikiPagesLocked(root, plan.deleteSlugs);
  await writeState(root, removeSourceFrom(await readState(root), plan.sourceFile));
  await regenerateDerived(root);
  return { skipped };
}

/**
 * Regenerate the artifacts derived from the page set.
 *
 * The embeddings refresh routes through {@link handleSafeEmbeddingFailure}, the
 * SAME shared catch every other lock-free `updateEmbeddingsLockedCore` caller
 * uses (`src/commands/query-save.ts`, `src/utils/embeddings-refresh.ts`) — so
 * `LLMWIKI_EMBED_STRICT` (the project-wide "any embedding failure exits
 * non-zero" opt-in) is honoured here exactly as everywhere else, instead of
 * this one path silently diverging from it. By default a failure only warns —
 * semantic search is an enhancement, and a missing key must not leave a
 * half-removed project — but by the time this runs, the source file, the
 * pages, and state.json have ALL already landed durably, so a strict-mode
 * rethrow here reports a stale embedding store, never a failed delete. The
 * empty changed-page list is correct — a removal adds no text to embed, and
 * the deleted pages fall out of the eligible set, so the migration prunes
 * their records.
 */
async function regenerateDerived(root: string): Promise<void> {
  await generateIndex(root);
  await generateMOC(root);
  try {
    await updateEmbeddingsLockedCore(root, []);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    handleSafeEmbeddingFailure(err, `Skipped embeddings update: ${message}`);
  }
}
