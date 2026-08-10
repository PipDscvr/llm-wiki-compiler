/**
 * @file test/commands/rm-cli.test.ts
 * @description Subprocess coverage for `llmwiki rm <source> [--dry-run]`.
 *
 * Spawns the built CLI (`dist/cli.js`) rather than calling `rmCommand`
 * directly, so these tests pin the same contract a real user hits: exit
 * codes, printed output, and — for `--dry-run` — a zero-writes guarantee (the
 * source file and its derived concept page are both still on disk
 * afterwards). The no-match case pins the pointer to `sources/`, the only
 * recovery hint `rm` gives for a ref that resolves to nothing — deliberately
 * not a pointer to `llmwiki status`, which reports only a source count and
 * cannot name the file the user is looking for. There is deliberately no
 * confirmation-flag test: the agreed CLI surface (issue #60) has none, so a
 * bare `rm` must apply outright.
 *
 * The `--dry-run` test asserts the FULL labelled "Would delete: <path>" line,
 * not just a bare substring like "junk" — a substring match would pass just
 * as well if delete/keep labelling were inverted, which is exactly the bug a
 * user relying on `--dry-run` (the only pre-flight check `rm` has) needs
 * caught. It also exercises a second, shared source so a `Kept:` line is
 * asserted too, not just the deletion.
 */

import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { exec, CLI, stripAnsi } from "../fixtures/cli-runner.js";
import { makeEmptyRmProject, twoSourceRmProject } from "../fixtures/rm-project.js";
import type { WikiState } from "../../src/utils/types.js";

/** A project with one source owning one concept page. */
async function oneSourceProject(): Promise<string> {
  const root = await makeEmptyRmProject();
  await writeFile(path.join(root, "sources/bad.md"), "---\ntitle: Bad\nsource: b\n---\nbody", "utf-8");
  await writeFile(path.join(root, "wiki/concepts/junk.md"), "---\ntitle: Junk\n---\njunk", "utf-8");
  const state: WikiState = {
    version: 1,
    indexHash: "h",
    sources: { "bad.md": { hash: "a", concepts: ["junk"], compiledAt: "2026-01-01T00:00:00Z" } },
  };
  await writeFile(path.join(root, ".llmwiki/state.json"), JSON.stringify(state), "utf-8");
  return root;
}

describe("llmwiki rm CLI", () => {
  it("--dry-run reports the full delete/keep lines and changes nothing", async () => {
    const root = await twoSourceRmProject();

    const { stdout } = await exec("node", [CLI, "rm", "bad.md", "--dry-run"], { cwd: root });
    const lines = stripAnsi(stdout);

    // Full labelled lines, not a bare substring: a delete/keep inversion would
    // still contain "junk" and "shared" either way, so only the label proves
    // which bucket each page landed in.
    expect(lines).toContain("Would delete: wiki/concepts/junk.md");
    expect(lines).toContain("Kept: wiki/concepts/shared.md (shared with other sources)");
    expect(existsSync(path.join(root, "sources/bad.md"))).toBe(true);
    expect(existsSync(path.join(root, "sources/good.md"))).toBe(true);
    expect(existsSync(path.join(root, "wiki/concepts/junk.md"))).toBe(true);
    expect(existsSync(path.join(root, "wiki/concepts/shared.md"))).toBe(true);
  });

  it("applies without any confirmation flag", async () => {
    const root = await oneSourceProject();

    await exec("node", [CLI, "rm", "bad.md"], { cwd: root });

    expect(existsSync(path.join(root, "sources/bad.md"))).toBe(false);
    expect(existsSync(path.join(root, "wiki/concepts/junk.md"))).toBe(false);
  });

  it("exits 1 with a pointer to sources/ when the ref matches nothing", async () => {
    const root = await oneSourceProject();

    const err = await exec("node", [CLI, "rm", "nope.md"], { cwd: root }).catch((e) => e);

    expect(err.code).toBe(1);
    expect(stripAnsi(err.stdout + err.stderr)).toContain("Look in sources/");
  });
});
