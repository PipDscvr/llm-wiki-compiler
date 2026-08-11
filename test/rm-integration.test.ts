/**
 * @file test/rm-integration.test.ts
 * @description End-to-end coverage for `llmwiki rm`'s I/O layer
 * (`src/sources/removal.ts`), exercising `planRemoval` + `applyRemovalLocked`
 * together against a real filesystem project rather than the pure planner in
 * isolation (already covered by `test/sources/removal-plan.test.ts`).
 *
 * This is the load-bearing suite — shared-concept preservation is the
 * maintainer's stated primary concern. It pins: a source's exclusively-owned
 * page is deleted while a page it only CO-owns with a live source survives
 * untouched; the source drops out of `state.json` and `wiki/index.md` is
 * regenerated; a wikilink a deletion breaks is reported in the plan WITHOUT
 * the surviving page ever being rewritten; and an unresolvable ref short-
 * circuits `planRemoval` to `null` rather than reaching the planner at all.
 *
 * It also pins the TOCTOU fix for the plan/apply split: `planRemoval` reads
 * state WITHOUT the lock (so `--dry-run` never has to take it), which leaves a
 * window where a concurrent compile can make a doomed slug shared before
 * `applyRemovalLocked` actually runs. The race test below applies a
 * deliberately STALE plan against state mutated after that plan was computed,
 * and asserts the newly-shared page survives — see `src/sources/removal.ts`.
 *
 * Two more things are pinned here from a post-implementation audit (H1/H2):
 * a removal must FREEZE the concepts it still shares with a live source (so a
 * later recompile of that live source can't silently drop the removed
 * source's contribution from the merged page), unioned with whatever was
 * already frozen by a prior batch; and a corrupt or too-new `state.json` must
 * make the whole removal REFUSE rather than fabricate an empty state and
 * destroy every other source's compile record.
 *
 * One more thing is pinned here from a second audit pass (P1): a profile
 * project's typed entity pages record no source ownership anywhere, so `rm`
 * can only ever act on `state.sources[file].concepts` — it must NOT refuse on
 * a profile project (one can legitimately still have concept pages), and the
 * plan it computes must carry the active profile's id so the CLI can warn
 * about what it cannot see or remove.
 */

import { describe, it, expect } from "vitest";
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { planRemoval, applyRemovalLocked } from "../src/sources/removal.js";
import { twoSourceRmProject, twoSourceRmProjectWithProfile, makeEmptyRmProject } from "./fixtures/rm-project.js";
import type { WikiState } from "../src/utils/types.js";

/**
 * Same shape as {@link twoSourceRmProject}, but `bad.md` exclusively owns a
 * THIRD concept, `race` — the slug the race test below makes shared out from
 * under a stale plan, so `applyRemovalLocked` must re-verify sharedness
 * itself rather than trusting the plan it was handed.
 */
async function raceProject(): Promise<string> {
  const root = await twoSourceRmProject();
  await writeFile(path.join(root, "wiki/concepts/race.md"), "---\ntitle: Race\n---\nrace body", "utf-8");
  const state = JSON.parse(await readFile(path.join(root, ".llmwiki/state.json"), "utf-8")) as WikiState;
  state.sources["bad.md"].concepts.push("race");
  await writeFile(path.join(root, ".llmwiki/state.json"), JSON.stringify(state), "utf-8");
  return root;
}

/**
 * Apply the standard `bad.md` removal against `root` and return the
 * resulting persisted state. Several assertions below need exactly this
 * "apply, then re-read state.json" sequence; factored out once rather than
 * repeated per test (fallow's clone detector flags the copy, same reasoning
 * as {@link twoSourceRmProject} in `fixtures/rm-project.ts`).
 */
async function removeBadMdAndReadState(root: string): Promise<WikiState> {
  await applyRemovalLocked(root, (await planRemoval(root, "bad.md"))!);
  return JSON.parse(await readFile(path.join(root, ".llmwiki/state.json"), "utf-8")) as WikiState;
}

describe("llmwiki rm end to end", () => {
  it("deletes the source and its exclusive page but keeps the shared one", async () => {
    const root = await twoSourceRmProject();

    const plan = await planRemoval(root, "bad.md");
    await applyRemovalLocked(root, plan!);

    expect(existsSync(path.join(root, "sources/bad.md"))).toBe(false);
    expect(existsSync(path.join(root, "wiki/concepts/junk.md"))).toBe(false);
    expect(existsSync(path.join(root, "wiki/concepts/shared.md"))).toBe(true); // still owned by good.md
    expect(existsSync(path.join(root, "sources/good.md"))).toBe(true);
  });

  it("drops the source from state and regenerates the index", async () => {
    const root = await twoSourceRmProject();

    const state = await removeBadMdAndReadState(root);
    expect(Object.keys(state.sources)).toEqual(["good.md"]);
    expect(existsSync(path.join(root, "wiki/index.md"))).toBe(true);
  });

  it("reports the wikilink the removal breaks without editing the page", async () => {
    const root = await twoSourceRmProject();

    const plan = await planRemoval(root, "bad.md");

    expect(plan!.brokenLinks).toEqual([{ file: path.join(root, "wiki/concepts/shared.md"), target: "junk" }]);
    const survivor = await readFile(path.join(root, "wiki/concepts/shared.md"), "utf-8");
    expect(survivor).toContain("[[Junk]]"); // reported, never rewritten
  });

  it("returns null for a ref that matches no source", async () => {
    const root = await twoSourceRmProject();

    expect(await planRemoval(root, "nope.md")).toBeNull();
  });

  it("re-verifies sharedness under the lock, so a slug a concurrent compile just made shared survives a stale plan", async () => {
    const root = await raceProject();
    const plan = await planRemoval(root, "bad.md");
    expect(plan!.deleteSlugs.slice().sort()).toEqual(["junk", "race"]); // both exclusive AT PLAN TIME

    // Simulate a concurrent compile landing in the plan-to-lock window: it
    // finishes and leaves `race` shared with good.md, exactly like a real
    // compile that just extracted the same concept from good.md's content
    // would. `plan` above is now STALE — it still says `race` is exclusive.
    const state = JSON.parse(await readFile(path.join(root, ".llmwiki/state.json"), "utf-8")) as WikiState;
    state.sources["good.md"].concepts.push("race");
    await writeFile(path.join(root, ".llmwiki/state.json"), JSON.stringify(state), "utf-8");

    await applyRemovalLocked(root, plan!); // apply the stale plan as-is

    expect(existsSync(path.join(root, "wiki/concepts/race.md"))).toBe(true); // now shared -- preserved
    expect(existsSync(path.join(root, "wiki/concepts/junk.md"))).toBe(false); // still exclusive -- deleted
  });

  it("freezes the source's still-shared concepts, so a later recompile can't silently drop its contribution", async () => {
    const root = await twoSourceRmProject();

    const state = await removeBadMdAndReadState(root);
    expect(state.frozenSlugs).toContain("shared"); // still owned by good.md -- must stay frozen
    expect(existsSync(path.join(root, "wiki/concepts/shared.md"))).toBe(true);
  });

  it("unions newly frozen concepts into slugs already frozen by a prior batch, rather than replacing them", async () => {
    const root = await twoSourceRmProject();
    const statePath = path.join(root, ".llmwiki/state.json");
    const seeded = JSON.parse(await readFile(statePath, "utf-8")) as WikiState;
    seeded.frozenSlugs = ["previously-frozen"];
    await writeFile(statePath, JSON.stringify(seeded), "utf-8");

    const state = await removeBadMdAndReadState(root);
    expect(state.frozenSlugs?.slice().sort()).toEqual(["previously-frozen", "shared"]);
  });

  it("refuses on a corrupt state.json instead of silently starting fresh and losing every other source's record", async () => {
    const root = await twoSourceRmProject();
    const statePath = path.join(root, ".llmwiki/state.json");
    const corrupt = "{ this is not valid json";
    await writeFile(statePath, corrupt, "utf-8");

    const attemptRemoval = async () => {
      const plan = await planRemoval(root, "bad.md");
      await applyRemovalLocked(root, plan!);
    };

    await expect(attemptRemoval()).rejects.toThrow();
    expect(existsSync(path.join(root, "sources/bad.md"))).toBe(true); // never reached deleteSource
    // Load-bearing: the pre-fix bug was SILENT DATA LOSS (the fabricated empty
    // state got written back, wiping every other source's record). Nothing
    // must touch this file on a refusal.
    expect(await readFile(statePath, "utf-8")).toBe(corrupt);
  });

  it("still deletes the source when state.json is missing entirely (never compiled)", async () => {
    const root = await makeEmptyRmProject();
    await writeFile(path.join(root, "sources/solo.md"), "---\ntitle: Solo\nsource: solo\n---\nbody", "utf-8");

    const plan = await planRemoval(root, "solo.md");
    await applyRemovalLocked(root, plan!);

    expect(existsSync(path.join(root, "sources/solo.md"))).toBe(false);
  });

  it("carries profileId: null in the plan for a default project", async () => {
    const root = await twoSourceRmProject();

    const plan = await planRemoval(root, "bad.md");

    expect(plan!.profileId).toBeNull();
  });

  it("still deletes exclusive concepts and keeps shared ones on a profile project, and carries its profileId", async () => {
    const root = await twoSourceRmProjectWithProfile();

    const plan = await planRemoval(root, "bad.md");
    expect(plan!.profileId).toBe("sample");

    // P1: rm must NOT refuse on a profile project — a profile project can
    // legitimately still have concept pages, and rm must go on deleting them
    // exactly as it does for a default project. It is the caller (the CLI)
    // that must warn about what this plan cannot see, not this apply step.
    await applyRemovalLocked(root, plan!);

    expect(existsSync(path.join(root, "wiki/concepts/junk.md"))).toBe(false);
    expect(existsSync(path.join(root, "wiki/concepts/shared.md"))).toBe(true); // still owned by good.md
  });
});
