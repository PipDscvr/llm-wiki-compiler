/**
 * @file test/commands/rm-cli.test.ts
 * @description Subprocess coverage for `llmwiki rm <source> [--dry-run]`.
 *
 * Spawns the built CLI (`dist/cli.js`) rather than calling `rmCommand`
 * directly, so these tests pin the same contract a real user hits: exit
 * codes, printed output, and — for `--dry-run` — a zero-writes guarantee (the
 * source file and its derived concept page are both still on disk
 * afterwards). The no-match case pins the pointer to `llmwiki status`, the
 * only recovery hint `rm` gives for a ref that resolves to nothing. There is
 * deliberately no confirmation-flag test: the agreed CLI surface (issue #60)
 * has none, so a bare `rm` must apply outright.
 */

import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { exec, CLI, stripAnsi } from "../fixtures/cli-runner.js";
import type { WikiState } from "../../src/utils/types.js";

/** A project with one source owning one concept page. */
async function oneSourceProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "rm-cli-"));
  await mkdir(path.join(root, "sources"), { recursive: true });
  await mkdir(path.join(root, "wiki/concepts"), { recursive: true });
  await mkdir(path.join(root, ".llmwiki"), { recursive: true });
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
  it("--dry-run reports the plan and changes nothing", async () => {
    const root = await oneSourceProject();

    const { stdout } = await exec("node", [CLI, "rm", "bad.md", "--dry-run"], { cwd: root });

    expect(stripAnsi(stdout)).toContain("junk");
    expect(existsSync(path.join(root, "sources/bad.md"))).toBe(true);
    expect(existsSync(path.join(root, "wiki/concepts/junk.md"))).toBe(true);
  });

  it("applies without any confirmation flag", async () => {
    const root = await oneSourceProject();

    await exec("node", [CLI, "rm", "bad.md"], { cwd: root });

    expect(existsSync(path.join(root, "sources/bad.md"))).toBe(false);
    expect(existsSync(path.join(root, "wiki/concepts/junk.md"))).toBe(false);
  });

  it("exits 1 with a pointer to status when the ref matches nothing", async () => {
    const root = await oneSourceProject();

    const err = await exec("node", [CLI, "rm", "nope.md"], { cwd: root }).catch((e) => e);

    expect(err.code).toBe(1);
    expect(stripAnsi(err.stdout + err.stderr)).toContain("llmwiki status");
  });
});
