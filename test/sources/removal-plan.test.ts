/**
 * @file test/sources/removal-plan.test.ts
 * @description Coverage for the pure removal planner (`src/sources/removal-plan.ts`)
 * that decides what `llmwiki rm` is allowed to delete.
 *
 * The suite pins the one rule the maintainer cares about most: a concept owned by
 * more than one source must survive even when one of its sources is removed. That
 * guarantee comes from delegating to `findSharedConcepts` — the same function
 * compile's `markOrphaned` uses — so this suite is exercising the delegation
 * itself, not a parallel reimplementation of the rule that could quietly drift
 * from it. It also covers the plan's two downstream consequences (wikilinks a
 * deletion would break, pending review candidates that reference the removed
 * source) and the total case of a source with no state entry at all.
 */

import { describe, it, expect } from "vitest";
import { computeRemovalPlan } from "../../src/sources/removal-plan.js";
import type { WikiState, ReviewCandidate } from "../../src/utils/types.js";

/** A v1 state where `bad.md` owns `junk` + `shared`, and `good.md` also owns `shared`. */
function twoSourceState(): WikiState {
  return {
    version: 1,
    indexHash: "h",
    sources: {
      "bad.md": { hash: "a", concepts: ["junk", "shared"], compiledAt: "2026-01-01T00:00:00Z" },
      "good.md": { hash: "b", concepts: ["shared"], compiledAt: "2026-01-01T00:00:00Z" },
    },
  };
}

describe("computeRemovalPlan", () => {
  it("deletes exclusively-owned concepts and keeps shared ones", () => {
    const plan = computeRemovalPlan({
      sourceFile: "bad.md",
      state: twoSourceState(),
      pages: [],
      candidates: [],
      profileId: null,
    });

    expect(plan.deleteSlugs).toEqual(["junk"]);
    expect(plan.keptSlugs).toEqual(["shared"]);
  });

  it("reports surviving pages whose wikilinks point at a deleted page", () => {
    const plan = computeRemovalPlan({
      sourceFile: "bad.md",
      state: twoSourceState(),
      pages: [
        { filePath: "wiki/concepts/shared.md", content: "see [[Junk]] and [[Shared]]" },
        { filePath: "wiki/concepts/junk.md", content: "the doomed page's own [[Junk]] link" },
      ],
      candidates: [],
      profileId: null,
    });

    // Only the SURVIVOR is reported; the doomed page's own link is irrelevant.
    expect(plan.brokenLinks).toEqual([{ file: "wiki/concepts/shared.md", target: "junk" }]);
  });

  it("reports pending candidates that reference the removed source", () => {
    const candidate = { id: "c1", sources: ["bad.md"] } as ReviewCandidate;
    const other = { id: "c2", sources: ["good.md"] } as ReviewCandidate;

    const plan = computeRemovalPlan({
      sourceFile: "bad.md",
      state: twoSourceState(),
      pages: [],
      candidates: [candidate, other],
      profileId: null,
    });

    expect(plan.candidateRefs).toEqual(["c1"]);
  });

  it("returns an empty plan for a source with no state entry", () => {
    const plan = computeRemovalPlan({
      sourceFile: "never-compiled.md",
      state: twoSourceState(),
      pages: [{ filePath: "wiki/concepts/shared.md", content: "[[Shared]]" }],
      candidates: [],
      profileId: null,
    });

    expect(plan).toEqual({
      sourceFile: "never-compiled.md",
      deleteSlugs: [],
      keptSlugs: [],
      brokenLinks: [],
      candidateRefs: [],
      profileId: null,
    });
  });

  // P1 audit fix: typed entity pages record no source ownership anywhere, so
  // the plan's `profileId` is the CLI's only signal that `deleteSlugs`/
  // `keptSlugs` aren't the full story for this source. The planner must not
  // originate that value itself — it only ever echoes what the caller supplied.
  it("returns profileId: null for a default project", () => {
    const plan = computeRemovalPlan({
      sourceFile: "bad.md",
      state: twoSourceState(),
      pages: [],
      candidates: [],
      profileId: null,
    });

    expect(plan.profileId).toBeNull();
  });

  it("passes a non-null profileId straight through, unmodified", () => {
    const plan = computeRemovalPlan({
      sourceFile: "bad.md",
      state: twoSourceState(),
      pages: [],
      candidates: [],
      profileId: "sample",
    });

    expect(plan.profileId).toBe("sample");
  });
});
