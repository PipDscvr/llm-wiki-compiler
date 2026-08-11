/**
 * @file src/sources/removal.ts
 * @description The I/O half of `llmwiki rm`: resolve a user-supplied ref to a
 * validated source basename, gather what the pure planner needs, and apply the
 * resulting plan under the project lock.
 *
 * The plan / dry-run / apply split mirrors `src/workflows/adapt.ts`:
 * {@link planRemoval} is READ-ONLY and takes NO lock, so `--dry-run` can print
 * exactly what would happen without any possibility of mutating the project;
 * {@link applyRemovalLocked} performs every mutation (source, pages, state)
 * inside the caller's lock and reports back what it ACTUALLY did.
 *
 * Derived-artifact regeneration is a SEPARATE step, {@link
 * regenerateDerivedLocked}, deliberately NOT called from inside
 * `applyRemovalLocked`. The caller (`rmCommand`, `src/commands/rm.ts`) runs it
 * AFTER printing the deletion report, not before, so the transcript's first
 * lines are always what the user asked for rather than this step's own
 * progress output — `rm` has no confirmation prompt, so that transcript is the
 * user's only record. Both calls still run inside the ONE held lock; the
 * split is about print ORDER, not locking.
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
 * {@link regenerateDerivedLocked} also re-embeds any other eligible page that
 * has no stored vector yet, so a removal can issue provider calls for pages it
 * never touched. See that function's docstring for the detail.
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
import { loadNonDefaultProfile } from "../profile/block.js";
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
 * Also resolves the active profile (a fourth lock-free, read-only lookup
 * alongside state/pages/candidates) purely to label the plan with its id —
 * see {@link RemovalPlan.profileId}. Nothing about the delete/keep split
 * depends on it. Uses the same helper `compile`'s index generation uses
 * (`loadNonDefaultProfile`, `src/compiler/indexgen.ts:61`), so a malformed
 * `profile.json` fails this command exactly as it already fails `compile` —
 * never silently ignored.
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
  const [state, pages, candidates, profile] = await Promise.all([
    readStateFailClosed(root),
    collectAllPages(root),
    listCandidates(root),
    loadNonDefaultProfile(root),
  ]);
  const profileId = profile?.profile.profileId ?? null;
  return computeRemovalPlan({ sourceFile, state, pages, candidates, profileId });
}

/**
 * What {@link applyRemovalLocked} actually did — the source of truth the CLI's
 * `printPlan` (`src/commands/rm.ts`) must report from, never the pre-lock
 * `RemovalPlan` itself, which can overstate reality (see `preserved`).
 */
export interface RemovalApplyResult {
  /** Slugs actually unlinked. */
  deleted: string[];
  /**
   * Slugs `plan.deleteSlugs` proposed but {@link reverifyDeletable} dropped
   * because a concurrent write made them shared with a live source in the
   * plan-to-lock window. The page SURVIVES, same as an ordinary
   * `plan.keptSlugs` page, but became shared DURING this removal rather than
   * having been shared all along — the CLI reports the two with different
   * wording (see `printKept` in `src/commands/rm.ts`) since the race case is
   * rarer and more surprising, and this is not a failure: it is the
   * protection working.
   */
  preserved: string[];
  /** Slugs the delete batch itself refused at the filename-safety floor. */
  skipped: SkippedDelete[];
}

/**
 * Apply a plan: MUTATE ONLY. PRECONDITION: the caller already holds the
 * project lock. See the file header for why the source file is deleted
 * before the pages, and for why derived-artifact regeneration is a separate,
 * caller-sequenced step rather than something this function does itself.
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
 * `withRunLock` rather than trusting a pre-lock plan. A slug this re-check
 * drops is reported back as {@link RemovalApplyResult.preserved}, not merged
 * into `skipped` — it was never attempted, let alone refused.
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
 * @returns See {@link RemovalApplyResult}.
 */
export async function applyRemovalLocked(root: string, plan: RemovalPlan): Promise<RemovalApplyResult> {
  // Read state FIRST, before any mutation, while the source's own state entry
  // is still present — findSharedConcepts needs it to see which concepts this
  // source currently owns. Reused below for reverifyDeletable, for freezing,
  // and for removeSourceFrom, so the whole apply works from one consistent
  // under-lock snapshot and findSharedConcepts runs exactly once.
  const fresh = await readStateFailClosed(root);
  const sharedNow = findSharedConcepts(plan.sourceFile, fresh);
  const { deletable, preserved } = reverifyDeletable(plan, sharedNow);

  await deleteSource(root, plan.sourceFile);
  // Floor-skipped pages are RETURNED, never swallowed: compile surfaces its own
  // skips as errors (src/compiler/index.ts:225), and a page the user asked to
  // remove that silently stayed on disk is exactly the failure `rm` exists to
  // prevent.
  const { skipped } = await deleteWikiPagesLocked(root, deletable);
  const deleted = withoutSkipped(deletable, skipped);

  const frozen = new Set(fresh.frozenSlugs ?? []);
  for (const slug of sharedNow) frozen.add(slug);
  const next = applyFrozenSlugs(removeSourceFrom(fresh, plan.sourceFile), frozen);
  await writeState(root, next);

  return { deleted, preserved, skipped };
}

/**
 * `deletable` minus whatever the delete batch itself refused at the filename-
 * safety floor — the accurate "what actually got unlinked" list. Split out so
 * {@link applyRemovalLocked} reads as one straight-line sequence and this
 * one-purpose set-difference is independently nameable and testable.
 *
 * @param deletable - The re-verified delete candidates passed to {@link
 *   deleteWikiPagesLocked}.
 * @param skipped - That call's floor-skipped subset of `deletable`.
 * @returns `deletable` with every skipped slug removed.
 */
function withoutSkipped(deletable: string[], skipped: SkippedDelete[]): string[] {
  const skippedSlugs = new Set(skipped.map((s) => s.slug));
  return deletable.filter((slug) => !skippedSlugs.has(slug));
}

/**
 * Partition the lock-free plan's doomed slugs against a FRESH shared-concept
 * set, so a slug that became shared after `plan` was computed is dropped from
 * the delete set rather than destroyed. A single pass over `plan.deleteSlugs`
 * — never a new list built from `sharedNow` — so `deletable` can only ever be
 * a SUBSET of what the plan proposed: a slug absent from the original plan
 * can never end up deleted because of this re-check.
 *
 * @param plan - The lock-free plan from {@link planRemoval}.
 * @param sharedNow - `findSharedConcepts(plan.sourceFile, freshState)`,
 *   computed ONCE by {@link applyRemovalLocked} and reused here AND for
 *   freezing, so the shared-concept scan never runs twice per removal.
 * @returns `deletable` — still safe to delete; `preserved` — dropped by this
 *   re-check because a concurrent write made the slug shared in the
 *   plan-to-lock window (see {@link RemovalApplyResult.preserved}).
 */
function reverifyDeletable(plan: RemovalPlan, sharedNow: Set<string>): { deletable: string[]; preserved: string[] } {
  const deletable: string[] = [];
  const preserved: string[] = [];
  for (const slug of plan.deleteSlugs) {
    (sharedNow.has(slug) ? preserved : deletable).push(slug);
  }
  return { deletable, preserved };
}

/**
 * Regenerate the artifacts derived from the page set: the index, the MOC, and
 * the embedding store. PRECONDITION: the caller MUST already hold the project
 * lock — this acquires nothing itself; the `Locked` suffix follows this
 * codebase's convention for that (e.g. {@link deleteWikiPagesLocked}), not a
 * claim that this function does any locking of its own.
 *
 * EXPORTED and called SEPARATELY from {@link applyRemovalLocked} — deliberately
 * not folded into it. `rmCommand` (`src/commands/rm.ts`) calls this AFTER
 * printing the deletion report, not before, so the transcript's first lines
 * are always the delete the user asked for, never this step's own progress
 * output (`generateIndex` prints "Generating index..." / "Index updated with
 * N pages.") and never a "Regenerated" summary asserted ahead of the work it
 * describes. Both calls run inside the SAME held lock either way.
 *
 * The embeddings refresh routes through {@link handleSafeEmbeddingFailure}, the
 * SAME shared catch every other lock-free `updateEmbeddingsLockedCore` caller
 * uses (`src/commands/query-save.ts`, `src/utils/embeddings-refresh.ts`) — so
 * `LLMWIKI_EMBED_STRICT` (the project-wide "any embedding failure exits
 * non-zero" opt-in) is honoured here exactly as everywhere else, instead of
 * this one path silently diverging from it. By default a failure only warns —
 * semantic search is an enhancement, and a missing key must not leave a
 * half-removed project — but by the time this runs, the source file, the
 * pages, and state.json have ALL already landed durably AND been reported to
 * the user, so a strict-mode rethrow here reports a stale embedding store on
 * top of a deletion the transcript already shows succeeded, never a failed
 * delete with nothing to show for it.
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
 *
 * @param root - Absolute project root.
 */
export async function regenerateDerivedLocked(root: string): Promise<void> {
  await generateIndex(root);
  await generateMOC(root);
  try {
    await updateEmbeddingsLockedCore(root, []);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    handleSafeEmbeddingFailure(err, `Skipped embeddings update: ${message}`);
  }
}
