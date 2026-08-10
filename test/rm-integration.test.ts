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
 */

import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { planRemoval, applyRemovalLocked } from "../src/sources/removal.js";
import type { WikiState } from "../src/utils/types.js";

/**
 * A project where `bad.md` owns `junk` outright and co-owns `shared` with
 * `good.md` — the exact shape the maintainer asked us not to get wrong.
 */
async function twoSourceProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "rm-int-"));
  await mkdir(path.join(root, "sources"), { recursive: true });
  await mkdir(path.join(root, "wiki/concepts"), { recursive: true });
  await mkdir(path.join(root, ".llmwiki"), { recursive: true });
  for (const name of ["bad", "good"]) {
    await writeFile(path.join(root, `sources/${name}.md`), `---\ntitle: ${name}\nsource: ${name}\n---\nbody`, "utf-8");
  }
  await writeFile(path.join(root, "wiki/concepts/junk.md"), "---\ntitle: Junk\n---\njunk body", "utf-8");
  await writeFile(path.join(root, "wiki/concepts/shared.md"), "---\ntitle: Shared\n---\nsee [[Junk]]", "utf-8");
  const state: WikiState = {
    version: 1,
    indexHash: "h",
    sources: {
      "bad.md": { hash: "a", concepts: ["junk", "shared"], compiledAt: "2026-01-01T00:00:00Z" },
      "good.md": { hash: "b", concepts: ["shared"], compiledAt: "2026-01-01T00:00:00Z" },
    },
  };
  await writeFile(path.join(root, ".llmwiki/state.json"), JSON.stringify(state), "utf-8");
  return root;
}

describe("llmwiki rm end to end", () => {
  it("deletes the source and its exclusive page but keeps the shared one", async () => {
    const root = await twoSourceProject();

    const plan = await planRemoval(root, "bad.md");
    await applyRemovalLocked(root, plan!);

    expect(existsSync(path.join(root, "sources/bad.md"))).toBe(false);
    expect(existsSync(path.join(root, "wiki/concepts/junk.md"))).toBe(false);
    expect(existsSync(path.join(root, "wiki/concepts/shared.md"))).toBe(true); // still owned by good.md
    expect(existsSync(path.join(root, "sources/good.md"))).toBe(true);
  });

  it("drops the source from state and regenerates the index", async () => {
    const root = await twoSourceProject();

    await applyRemovalLocked(root, (await planRemoval(root, "bad.md"))!);

    const state = JSON.parse(await readFile(path.join(root, ".llmwiki/state.json"), "utf-8")) as WikiState;
    expect(Object.keys(state.sources)).toEqual(["good.md"]);
    expect(existsSync(path.join(root, "wiki/index.md"))).toBe(true);
  });

  it("reports the wikilink the removal breaks without editing the page", async () => {
    const root = await twoSourceProject();

    const plan = await planRemoval(root, "bad.md");

    expect(plan!.brokenLinks).toEqual([{ file: path.join(root, "wiki/concepts/shared.md"), target: "junk" }]);
    const survivor = await readFile(path.join(root, "wiki/concepts/shared.md"), "utf-8");
    expect(survivor).toContain("[[Junk]]"); // reported, never rewritten
  });

  it("returns null for a ref that matches no source", async () => {
    const root = await twoSourceProject();

    expect(await planRemoval(root, "nope.md")).toBeNull();
  });
});
