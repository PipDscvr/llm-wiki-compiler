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
 */

import { describe, it, expect } from "vitest";
import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { planRemoval, applyRemovalLocked } from "../src/sources/removal.js";
import { twoSourceRmProject } from "./fixtures/rm-project.js";
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

    await applyRemovalLocked(root, (await planRemoval(root, "bad.md"))!);

    const state = JSON.parse(await readFile(path.join(root, ".llmwiki/state.json"), "utf-8")) as WikiState;
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
});
