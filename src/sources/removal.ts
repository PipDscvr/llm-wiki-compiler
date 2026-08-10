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
 * No LLM provider is REQUIRED anywhere on this path — a missing or broken
 * embeddings backend only warns (or exits under LLMWIKI_EMBED_STRICT), never
 * blocks the delete. But one CAN be called: the refresh in
 * {@link regenerateDerived} also re-embeds any other eligible page that has no
 * stored vector yet, so a removal can issue provider calls for pages it never
 * touched. See that function's docstring for the detail.
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
import { findSharedConcepts } from "../compiler/deps.js";
import type { WikiState } from "../utils/types.js";

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
 * RE-VERIFIES the exclusive/shared split against FRESHLY-READ state before
 * deleting anything, rather than trusting `plan.deleteSlugs` outright.
 * {@link planRemoval} reads state WITHOUT the lock — deliberately, so
 * `--dry-run` never has to take it — which leaves a window between that read
 * and this one where a concurrent `compile`/`watch` can land. If it makes one
 * of the doomed slugs shared, deleting it here would destroy a page a live
 * source now owns: exactly the failure this feature must not ship. This
 * follows the codebase's existing convention that the UNDER-LOCK handler is
 * the authority and a caller-supplied plan is intent only — stated at
 * `src/trust/executor.ts:178-181` and practised by `adaptApply`
 * (`src/workflows/adapt.ts:405`), which re-runs `computeAdaptationPlan` inside
 * `withRunLock` rather than trusting a pre-lock plan.
 *
 * @param root - Absolute project root.
 * @param plan - The plan produced by {@link planRemoval}.
 */
export async function applyRemovalLocked(
  root: string,
  plan: RemovalPlan,
): Promise<{ skipped: SkippedDelete[] }> {
  // Read state FIRST, before any mutation, while the source's own state entry
  // is still present — findSharedConcepts needs it to see which concepts this
  // source currently owns. Reused below for removeSourceFrom so the whole
  // apply works from one consistent under-lock snapshot.
  const fresh = await readState(root);
  const deletable = reverifyDeletable(plan, fresh);

  await deleteSource(root, plan.sourceFile);
  // Floor-skipped pages are RETURNED, never swallowed: compile surfaces its own
  // skips as errors (src/compiler/index.ts:225), and a page the user asked to
  // remove that silently stayed on disk is exactly the failure `rm` exists to
  // prevent.
  const { skipped } = await deleteWikiPagesLocked(root, deletable);
  await writeState(root, removeSourceFrom(fresh, plan.sourceFile));
  await regenerateDerived(root);
  return { skipped };
}

/**
 * Intersect the lock-free plan's doomed slugs against a FRESH read of shared
 * concepts, so a slug that became shared after `plan` was computed is dropped
 * from the delete set. A plain `.filter` over `plan.deleteSlugs` — never a new
 * list built from `freshState` — so this can only ever SHRINK what the plan
 * proposed, never grow it: a slug absent from the original plan can never end
 * up deleted because of this re-check.
 *
 * @param plan - The lock-free plan from {@link planRemoval}.
 * @param freshState - State read AFTER the lock was acquired, with the
 *   source's own entry still present (required by {@link findSharedConcepts}).
 * @returns The subset of `plan.deleteSlugs` still safe to delete.
 */
function reverifyDeletable(plan: RemovalPlan, freshState: WikiState): string[] {
  const sharedNow = findSharedConcepts(plan.sourceFile, freshState);
  return plan.deleteSlugs.filter((slug) => !sharedNow.has(slug));
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
 * rethrow here reports a stale embedding store, never a failed delete.
 *
 * The empty changed-page list only means THIS removal contributes no new text
 * of its own — it does NOT make this a prune-only step. `updateEmbeddingsLockedCore`
 * independently re-embeds every eligible page that has no stored vector yet
 * (`addNewEligiblePages`, `src/utils/embeddings-migrate.ts:243-248`) and, if the
 * store's embedding identity changed, EVERY eligible page (`rebuild`, same file
 * `:91-96`) — either can call the provider for pages this removal never
 * touched. `reembedIntoStore` also constructs the provider UNCONDITIONALLY
 * (`src/utils/embeddings-write.ts:62`), so this step is attempted even with no
 * embeddings backend configured at all; it is the `handleSafeEmbeddingFailure`
 * catch above, not a skip, that keeps a missing/broken backend from failing
 * the removal by default.
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
