/**
 * @file src/wiki/delete-page.ts
 * @description Journalled deletion of wiki concept pages — the delete
 * counterpart to the journalled write batch in `src/compiler/compile-write.ts`.
 *
 * Every wiki page WRITE in llmwiki routes through a journal batch so a crash
 * mid-mutation replays back to the pre-state. Deletion needs the same guarantee,
 * and needs it more: `llmwiki rm` has no confirmation prompt, so the journal is
 * the ONLY recovery path if the process dies partway through a removal.
 *
 * Each page's bytes are recorded via `recordPreState` BEFORE it is unlinked, so
 * `replayJournal` restores every page in a batch that never committed. That buys
 * crash-recovery WITHOUT extending the trust executor: this module composes the
 * same public journal primitives the write path composes.
 *
 * Two contracts are deliberately mirrored from `applyCompilePageWritesLocked`:
 *
 *  - SKIP, NOT ABORT. A slug failing the {@link isSafeFilenameComponent} floor is
 *    reported in `skipped`, never path-joined, and never fatal to the rest of the
 *    batch — an out-of-tree slug must not be able to cancel a legitimate removal.
 *  - EMPTY ⇒ NO-OP. With nothing deletable, NO batch is opened, so a no-op
 *    removal leaves no dangling pending batch and no false recovery window.
 *
 * PRECONDITION: the caller MUST already hold the project lock. This acquires
 * nothing, so it is safe inside an outer locked region.
 */

import path from "path";
import { CONCEPTS_DIR } from "../utils/constants.js";
import { isSafeFilenameComponent } from "../profile/identity.js";
import { openBatch, recordPreState, commitBatch, replayJournal, confinedUnlink } from "../trust/journal.js";

/** The unlink primitive, injectable so a crash mid-batch is testable. */
export type UnlinkOne = (targetPath: string) => Promise<void>;

/** A page the batch refused to delete, with the floor that refused it. */
export interface SkippedDelete {
  /** The offending slug, as supplied. */
  slug: string;
  /** Machine-readable reason, prefixed `floor:` like the write path's skips. */
  reason: string;
}

/** Options for {@link deleteWikiPagesLocked}. */
export interface DeleteOptions {
  /** Override the unlink primitive (fault injection). Defaults to `confinedUnlink`. */
  unlinkOne?: UnlinkOne;
}

/**
 * Delete concept pages as ONE journalled batch under the caller's held lock.
 *
 * @param root - Absolute project root.
 * @param slugs - Bare concept slugs (no `.md`, no directory part).
 * @param opts - Optional injectable unlink primitive.
 * @returns The floor-skipped slugs; allowed pages are deleted as a side effect.
 */
export async function deleteWikiPagesLocked(
  root: string,
  slugs: string[],
  opts: DeleteOptions = {},
): Promise<{ skipped: SkippedDelete[] }> {
  // Replay-before-mutate, under the held lock: recover any batch a prior crash
  // left pending BEFORE opening a new one. Mirrors the executor's dispatch.
  await replayJournal(root);

  const { allowed, skipped } = partitionBySlugFloor(slugs);
  if (allowed.length === 0) return { skipped };

  const unlinkOne = opts.unlinkOne ?? ((target: string) => confinedUnlink(target, root));
  const batch = await openBatch(root);
  for (const slug of allowed) {
    const target = path.join(root, CONCEPTS_DIR, `${slug}.md`);
    await recordPreState(batch, target);
    await unlinkOne(target);
  }
  await commitBatch(batch);
  return { skipped };
}

/**
 * Split slugs by the filename floor. The floor is applied HERE, independently of
 * any caller-side validation, so an out-of-tree slug can never reach a path-join
 * no matter who calls this.
 */
function partitionBySlugFloor(slugs: string[]): { allowed: string[]; skipped: SkippedDelete[] } {
  const allowed: string[] = [];
  const skipped: SkippedDelete[] = [];
  for (const slug of slugs) {
    if (isSafeFilenameComponent(slug)) allowed.push(slug);
    else skipped.push({ slug, reason: "floor:unsafe-slug" });
  }
  return { allowed, skipped };
}
