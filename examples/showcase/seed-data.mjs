/**
 * @file examples/showcase/seed-data.mjs
 * @description The source-ownership map `seed.mjs` builds
 * `.llmwiki/state.json` from — which sources exist, which concepts each one
 * produced, and which two were edited or deleted after the last compile.
 *
 * Kept separate from the orchestration in `seed.mjs` so neither file grows past
 * the project's size budget, and so a reader who wants to know "what does this
 * example claim about itself" reads one file of data instead of skimming logic.
 * The review-candidate drafts live in `seed-candidates.mjs` for the same reason:
 * they carry whole rendered page bodies and outgrow a shared file quickly.
 *
 * Every timestamp here is a FIXED literal rather than `new Date()`, so seeding
 * twice produces the same `state.json` bytes — the example's idempotence
 * guarantee starts with its inputs being constant.
 */

/**
 * Sources whose recorded digest still matches the file on disk, mapped to the
 * concept slugs each one produced. Pages listed here resolve to `fresh`.
 * `wikilinks` appears twice on purpose: a merged page owned by two sources is
 * the case the freshness rules exist for, and it should be exercised.
 */
export const FRESH_SOURCE_CONCEPTS = {
  "knowledge-compilation.md": [
    "knowledge-compilation",
    "compilation-pipeline",
    "wikilinks",
    "incremental-compilation",
  ],
  "provenance-and-citations.md": [
    "claim-level-citations",
    "source-spans",
    "provenance-metadata",
  ],
  "incremental-builds.md": [
    "change-detection",
    "incremental-compilation",
    "page-freshness",
  ],
  "review-gates.md": ["review-candidates", "held-reasons", "wikilinks"],
};

/**
 * The source that was edited after the last compile. Its recorded digest is a
 * sentinel that cannot match the file's real content, which is exactly the
 * condition `stale` means: the file is still there, but it no longer says what
 * it said when these pages were written.
 */
export const EDITED_SOURCE = {
  file: "retrieval-pipelines.md",
  concepts: ["semantic-chunking", "embedding-index"],
};

/**
 * The source that was deleted after the last compile. It stays in state — that
 * is the whole point — while its file is absent from `sources/`, so the page it
 * owned resolves to `orphaned` and its citations stop resolving.
 */
export const DELETED_SOURCE = {
  file: "legacy-import-notes.md",
  concepts: ["okf-bundles"],
};

/** Compile timestamps recorded per source, fixed so re-seeding is a no-op diff. */
export const COMPILED_AT = {
  "knowledge-compilation.md": "2026-07-28T16:41:04.010Z",
  "provenance-and-citations.md": "2026-07-29T08:03:19.640Z",
  "incremental-builds.md": "2026-07-30T13:55:41.451Z",
  "review-gates.md": "2026-08-01T10:12:07.781Z",
  "retrieval-pipelines.md": "2026-07-22T14:31:56.014Z",
  "legacy-import-notes.md": "2026-07-16T09:44:02.550Z",
};
