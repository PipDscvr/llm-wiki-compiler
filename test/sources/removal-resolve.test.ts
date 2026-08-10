/**
 * @file test/sources/removal-resolve.test.ts
 * @description Coverage for `resolveSourceRef` (`src/sources/removal.ts`) —
 * the ref-to-basename normalizer that sits in front of `llmwiki rm`'s planner.
 *
 * The suite pins the single "no such source" outcome the function collapses
 * everything problematic into: a `.md` suffix is appended when the caller
 * omits it (ergonomics), and an absent file, a path-unsafe ref (a URL or a
 * `..` traversal — both fail `assertSafeSourceId`, which THROWS rather than
 * returning false), and a symlinked `sources/` entry all resolve to `null`
 * rather than a thrown exception or a taxonomy of failure reasons. The
 * symlink case pins that `resolveSourceRef` stays consistent with
 * `getSource`/`deleteSource`, which already refuse symlinked entries.
 */

import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveSourceRef } from "../../src/sources/removal.js";

/** A temp project holding one real source at `sources/note.md`. */
async function projectWithSource(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "rm-resolve-"));
  await mkdir(path.join(root, "sources"), { recursive: true });
  await writeFile(path.join(root, "sources/note.md"), "---\ntitle: Note\nsource: s\n---\nbody", "utf-8");
  return root;
}

describe("resolveSourceRef", () => {
  it("accepts a basename with or without the .md suffix", async () => {
    const root = await projectWithSource();

    expect(await resolveSourceRef(root, "note.md")).toBe("note.md");
    expect(await resolveSourceRef(root, "note")).toBe("note.md");
  });

  it("returns null for an absent source", async () => {
    const root = await projectWithSource();

    expect(await resolveSourceRef(root, "missing.md")).toBeNull();
  });

  it("returns null rather than throwing for a path-unsafe ref", async () => {
    const root = await projectWithSource();

    // A URL and a traversal both fail assertSafeSourceId; neither may throw out.
    expect(await resolveSourceRef(root, "https://example.com/x")).toBeNull();
    expect(await resolveSourceRef(root, "../../etc/passwd")).toBeNull();
  });

  it("refuses a symlinked entry, matching getSource and deleteSource", async () => {
    const root = await projectWithSource();
    await writeFile(path.join(root, "secret.txt"), "SECRET", "utf-8");
    await symlink(path.join(root, "secret.txt"), path.join(root, "sources/leak.md"));

    expect(await resolveSourceRef(root, "leak.md")).toBeNull();
  });
});
