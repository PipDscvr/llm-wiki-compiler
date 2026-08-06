/**
 * @file examples/profile-newsroom/seed-content.mjs
 * @description Materializes this example's committed `content/` tree into the
 * `wiki/` directories the newsroom profile declares, and clears that tree again
 * for a from-scratch re-seed.
 *
 * WHY the content is not simply committed at `wiki/`: `llmwiki template init`
 * REFUSES to install a profile over a non-empty typed corpus. That is the right
 * rule — reinterpreting existing pages under a schema they were never written
 * against is a migration, not an install — but it means a profile project is
 * installed EMPTY and populated afterwards. `content/` is this example's
 * committed copy of "afterwards", so the seed can perform the install honestly
 * through the real CLI instead of writing `.llmwiki/profile.json` behind its
 * back.
 *
 * The copy is a plain file copy, deliberately: these are markdown PAGES, not a
 * machine-owned format, so there is no writer to route them through and nothing
 * to rot. Every path is confined to the example directory.
 */

import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";

/** The committed source-of-truth directory, and the generated tree it becomes. */
const CONTENT_DIR = "content";
const WIKI_DIR = "wiki";

/**
 * Resolve `relative` inside `exampleDir`, refusing anything that escapes it.
 * These helpers delete and overwrite directories, so the confinement is asserted
 * rather than assumed — a wrong `exampleDir` must fail here, not mid-`rm`.
 */
function confine(exampleDir, relative) {
  const resolved = path.resolve(exampleDir, relative);
  const base = path.resolve(exampleDir);
  if (resolved !== path.join(base, relative)) {
    throw new Error(`refusing to touch ${resolved}: outside ${base}`);
  }
  return resolved;
}

/**
 * Delete the generated `wiki/` tree.
 *
 * Called ONLY on the from-scratch path (no profile installed yet), because
 * `template init`'s corpus probe requires the typed page directories AND the
 * relation/event stores under `wiki/graph/` to be empty. Everything removed here
 * is regenerated later in the same run: the pages from `content/`, the graph
 * from the seeded filings and runs.
 *
 * @param exampleDir - Absolute path to this example directory.
 */
export async function resetWiki(exampleDir) {
  await rm(confine(exampleDir, WIKI_DIR), { recursive: true, force: true });
}

/**
 * Copy `content/` over `wiki/`, creating it when absent. Idempotent: the copy
 * overwrites with identical bytes and never deletes, so pages the seeded
 * workflow runs wrote live (which have no `content/` counterpart) survive a
 * re-run untouched.
 *
 * @param exampleDir - Absolute path to this example directory.
 * @returns The number of markdown files copied.
 */
export async function materializeWiki(exampleDir) {
  const from = confine(exampleDir, CONTENT_DIR);
  await stat(from); // fail loudly, not silently, when the committed content is gone
  let copied = 0;
  await cp(from, confine(exampleDir, WIKI_DIR), {
    recursive: true,
    filter: (source) => {
      if (source.endsWith(".md")) copied += 1;
      return true;
    },
  });
  return copied;
}
