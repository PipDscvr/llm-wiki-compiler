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
 *
 * The profile-warning tests (P1 audit fix) combine stdout and stderr before
 * asserting: `output.status`'s headline goes to stdout, but the `output.note`
 * detail lines below it go to stderr (the codebase's existing convention for
 * every `printConsequences` warning, not new here) — see `src/utils/output.ts`.
 *
 * The ordering test (transcript-truthfulness audit fix 1) asserts the deletion
 * report's position RELATIVE to `generateIndex`'s own "Generating index..."
 * progress line, not the full output verbatim — pinning exact whole-output
 * equality here would make the test brittle against unrelated output changes
 * elsewhere in the regeneration step, when the one thing this test exists to
 * pin is which one comes first.
 */

import { describe, it, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { exec, CLI, stripAnsi } from "../fixtures/cli-runner.js";
import { makeEmptyRmProject, twoSourceRmProject, twoSourceRmProjectWithProfile } from "../fixtures/rm-project.js";
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

  it("does not warn about a profile on a default project", async () => {
    const root = await twoSourceRmProject();

    const { stdout, stderr } = await exec("node", [CLI, "rm", "bad.md", "--dry-run"], { cwd: root });

    expect(stripAnsi(stdout + stderr)).not.toContain("This project uses the");
  });

  it("warns that typed entity pages are untracked and untouched on a profile project's --dry-run", async () => {
    const root = await twoSourceRmProjectWithProfile();

    const { stdout, stderr } = await exec("node", [CLI, "rm", "bad.md", "--dry-run"], { cwd: root });
    const lines = stripAnsi(stdout + stderr);

    expect(lines).toContain("This project uses the `sample` profile.");
    expect(lines).toContain("Typed entity pages are not tracked to the source they came from");
    expect(lines).toContain("Any entity pages from this source remain and must be removed manually.");
  });

  it("warns on the applied path too, not only --dry-run", async () => {
    const root = await twoSourceRmProjectWithProfile();

    const { stdout, stderr } = await exec("node", [CLI, "rm", "bad.md"], { cwd: root });

    expect(stripAnsi(stdout + stderr)).toContain("This project uses the `sample` profile.");
  });

  it("prints the deletion report before regeneration's own progress output", async () => {
    const root = await oneSourceProject();

    const { stdout } = await exec("node", [CLI, "rm", "bad.md"], { cwd: root });
    const text = stripAnsi(stdout);

    const deletedAt = text.indexOf("Deleted: sources/bad.md");
    const regeneratingAt = text.indexOf("Generating index");
    expect(deletedAt).toBeGreaterThanOrEqual(0);
    expect(regeneratingAt).toBeGreaterThanOrEqual(0);
    // The user asked for the delete; regeneration is housekeeping that follows
    // it, not the other way round — see src/commands/rm.ts's header docstring.
    expect(deletedAt).toBeLessThan(regeneratingAt);
  });

  it("reports every deleted page on an ordinary removal and exits 0", async () => {
    const root = await twoSourceRmProject();

    const { stdout } = await exec("node", [CLI, "rm", "bad.md"], { cwd: root });
    const lines = stripAnsi(stdout);

    // exec rejects on a non-zero exit, so reaching this point already pins
    // exit 0; the lines below pin that a normal removal's report is complete.
    expect(lines).toContain("Deleted: sources/bad.md");
    expect(lines).toContain("Deleted: wiki/concepts/junk.md");
    expect(lines).toContain("Kept: wiki/concepts/shared.md (shared with other sources)");
  });
});
