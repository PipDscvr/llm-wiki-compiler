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
import {
  readStateClassified,
  writeState,
  removeSourceFrom,
  applyFrozenSlugs,
  StateTooNewError,
} from "../utils/state.js";
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
 * Read `.llmwiki/state.json` for `rm`, FAILING CLOSED on a state file this
 * build cannot trust, instead of `readState`'s (`src/utils/state.ts:222`)
 * fabricate-and-recover behaviour.
 *
 * `readState` treats a corrupt or too-new file as `emptyState()` (backing the
 * original up first) so the caller can carry on — correct for `compile`,
 * which REBUILDS whatever it reads, so starting from empty just means a full
 * recompile. It is WRONG for `rm`, which cannot rebuild what it destroys: a
 * plan computed against a fabricated empty state has an empty
 * `state.sources[sourceFile].concepts`, so `deleteSlugs` comes out empty too
 * — the entire point of the command, silently defeated. Worse,
 * `applyRemovalLocked` would then delete the source file, delete NO pages,
 * and persist the fabricated empty state back to disk via `writeState` —
 * wiping the compile record for every OTHER live source in the same write.
 * The command would report success while the next `compile` reprocesses the
 * whole corpus at full LLM cost and the pages `rm` should have deleted linger
 * as untracked orphans forever.
 *
 * Used by BOTH `rm` entry points ({@link planRemoval} and
 * {@link applyRemovalLocked}) so `--dry-run` and the real apply agree, and so
 * a corrupt/too-new state produces exactly ONE refusal instead of two calls
 * to `readState` each fabricating their own state and printing their own
 * "Corrupt state.json" warning.
 *
 * @param root - Absolute project root.
 * @returns The parsed state. A `missing` file returns an empty state — that
 *   IS legitimate: the source simply has no derived pages yet, and `rm`
 *   should still be able to delete the source file itself.
 * @throws {StateTooNewError} if state.json was written by a newer llmwiki.
 * @throws {Error} if state.json is present but unparseable/malformed — `rm`
 *   cannot tell which pages came from which source, so it must refuse rather
 *   than guess.
 */
async function readStateFailClosed(root: string): Promise<WikiState> {
  const classified = await readStateClassified(root);
  if (classified.status === "too-new") {
    throw new StateTooNewError(classified.state.version as number);
  }
  if (classified.status === "corrupt") {
    throw new Error(
      "`.llmwiki/state.json` is corrupt, so llmwiki cannot tell which wiki pages this " +
        "source (or any other) came from. Nothing has been removed. Run " +
        "`llmwiki state reset --yes` to back up and clear the corrupt state file (its " +
        "`--yes` path operates on raw bytes, so it works even on a corrupt file), then " +
        "`llmwiki compile` to rebuild state, and retry.",
    );
  }
  return classified.state;
}

/**
 * READ-ONLY: resolve the ref and compute the plan. Takes NO lock and writes
 * nothing — including on a corrupt or too-new `state.json`, which
 * {@link readStateFailClosed} makes this REFUSE (throw) rather than silently
 * recovering-and-backing-up the way plain `readState` would — so `--dry-run`
 * is unconditionally incapable of mutating the project.
 *
 * @param root - Absolute project root.
 * @param ref - The raw `<source>` argument.
 * @returns The plan, or `null` when the ref matches no source.
 * @throws {StateTooNewError} if state.json was written by a newer llmwiki.
 * @throws {Error} if state.json is corrupt — see {@link readStateFailClosed}.
 */
export async function planRemoval(root: string, ref: string): Promise<RemovalPlan | null> {
  const sourceFile = await resolveSourceRef(root, ref);
  if (sourceFile === null) return null;
  const [state, pages, candidates] = await Promise.all([
    readStateFailClosed(root),
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
 * FREEZES the source's still-shared concepts before writing state, mirroring
 * what `compile`'s deletion path does for the exact same situation
 * (`findFrozenSlugs`, `src/compiler/deps.ts:132-159`). A kept page's FILE
 * survives on disk, but its on-disk CONTENT is a merge that includes the
 * now-removed source's contribution — the file alone carries no memory of
 * that. `mergeExtractions` (`src/compiler/extraction-merge.ts:91`) is the one
 * thing that skips regenerating a frozen slug from live sources only; without
 * adding these slugs to `state.frozenSlugs` here, the NEXT time a remaining
 * contributor to that page is recompiled, the page would be rebuilt from live
 * sources alone and the removed source's contribution would silently vanish
 * — exactly the guarantee this feature exists to provide. The set is UNIONED
 * with whatever is already persisted (never replaced via {@link
 * applyFrozenSlugs}), mirroring `findFrozenSlugs`' own "start with persisted
 * frozen slugs from prior batches" behaviour (`deps.ts:137`), so an earlier
 * removal's or compile's frozen slugs are never dropped by a later one.
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
  // source currently owns. Reused below for reverifyDeletable, for freezing,
  // and for removeSourceFrom, so the whole apply works from one consistent
  // under-lock snapshot and findSharedConcepts runs exactly once.
  const fresh = await readStateFailClosed(root);
  const sharedNow = findSharedConcepts(plan.sourceFile, fresh);
  const deletable = reverifyDeletable(plan, sharedNow);

  await deleteSource(root, plan.sourceFile);
  // Floor-skipped pages are RETURNED, never swallowed: compile surfaces its own
  // skips as errors (src/compiler/index.ts:225), and a page the user asked to
  // remove that silently stayed on disk is exactly the failure `rm` exists to
  // prevent.
  const { skipped } = await deleteWikiPagesLocked(root, deletable);

  const frozen = new Set(fresh.frozenSlugs ?? []);
  for (const slug of sharedNow) frozen.add(slug);
  const next = applyFrozenSlugs(removeSourceFrom(fresh, plan.sourceFile), frozen);
  await writeState(root, next);

  await regenerateDerived(root);
  return { skipped };
}

/**
 * Intersect the lock-free plan's doomed slugs against a FRESH shared-concept
 * set, so a slug that became shared after `plan` was computed is dropped from
 * the delete set. A plain `.filter` over `plan.deleteSlugs` — never a new list
 * built from `sharedNow` — so this can only ever SHRINK what the plan
 * proposed, never grow it: a slug absent from the original plan can never end
 * up deleted because of this re-check.
 *
 * @param plan - The lock-free plan from {@link planRemoval}.
 * @param sharedNow - `findSharedConcepts(plan.sourceFile, freshState)`,
 *   computed ONCE by {@link applyRemovalLocked} and reused here AND for
 *   freezing, so the shared-concept scan never runs twice per removal.
 * @returns The subset of `plan.deleteSlugs` still safe to delete.
 */
function reverifyDeletable(plan: RemovalPlan, sharedNow: Set<string>): string[] {
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
