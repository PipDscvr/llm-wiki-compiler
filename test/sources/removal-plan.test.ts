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
    });

    expect(plan.candidateRefs).toEqual(["c1"]);
  });

  it("returns an empty plan for a source with no state entry", () => {
    const plan = computeRemovalPlan({
      sourceFile: "never-compiled.md",
      state: twoSourceState(),
      pages: [{ filePath: "wiki/concepts/shared.md", content: "[[Shared]]" }],
      candidates: [],
    });

    expect(plan).toEqual({
      sourceFile: "never-compiled.md",
      deleteSlugs: [],
      keptSlugs: [],
      brokenLinks: [],
      candidateRefs: [],
    });
  });
});
