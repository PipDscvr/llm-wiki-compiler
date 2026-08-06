/**
 * @file examples/showcase/seed-data.mjs
 * @description The literal data `seed.mjs` feeds into llmwiki's own writers:
 * the source-ownership map that `.llmwiki/state.json` is built from, and the
 * three review-candidate drafts.
 *
 * Kept separate from the orchestration in `seed.mjs` so neither file grows past
 * the project's size budget, and so a reader who wants to know "what does this
 * example claim about itself" reads one file of data instead of skimming logic.
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

const RERANKING_BODY = `---
title: Semantic Reranking
summary: A second-pass scorer that reorders retrieved chunks before they reach the answer prompt
sources:
  - retrieval-pipelines.md
kind: concept
createdAt: "2026-08-02T09:14:55.201Z"
updatedAt: "2026-08-02T09:14:55.201Z"
confidence: 0.34
provenanceState: inferred
---

# Semantic Reranking

**Semantic reranking** is the third pass of the retrieval cascade: after a vector
pre-filter and a chunk-level narrowing, a stronger scorer reorders what survives
and keeps roughly a dozen chunks. ^[retrieval-pipelines.md:38-41]

Each pass is cheaper than the one it feeds, so the expensive comparison only ever
runs over a short list. ^[retrieval-pipelines.md:43-44]

The source does not say which scorer is used, how it is trained, or how the keep
count was chosen, and this draft does not either. That gap is why generation-time
confidence came out at 0.34 and why the page is sitting here instead of in
[[Embedding Index]]'s neighbourhood on disk.
`;

const CONNECTOR_BODY = `---
title: Connector Provenance
summary: Host-authored records of where connector-fetched material came from, attached before the material becomes a page
sources:
  - review-gates.md
kind: concept
createdAt: "2026-08-03T14:20:11.882Z"
updatedAt: "2026-08-03T14:20:11.882Z"
confidence: 0.81
provenanceState: extracted
contradictedBy:
  - slug: provenance-metadata
    reason: "Claims connector records are authoritative; provenance-metadata treats every provenance signal as advisory"
---

# Connector Provenance

Material pulled by a connector arrives with a host-authored provenance block
naming the endpoint, the fetch time, and the identity the fetch ran as. The block
is attached before the material is rendered, so it cannot be lost in generation.
^[review-gates.md:39]

Connector-fetched pages are always held. The \`connector-fetched\` reason exists so
the queue can distinguish "a model wrote this from your documents" from "a remote
system supplied this", which are different trust questions. See [[Held Reasons]].
^[review-gates.md:26-39]

This draft asserts that a connector's own provenance record is authoritative,
which is exactly what [[Provenance Metadata]] declines to say about any provenance
signal. The contradiction is recorded rather than resolved.
`;

const EMBEDDINGS_BODY = `---
title: Pending Embeddings
summary: The durable retry list naming pages whose embedding refresh failed, drained by the next successful compile
sources:
  - retrieval-pipelines.md
kind: concept
createdAt: "2026-08-04T08:47:39.115Z"
updatedAt: "2026-08-04T08:47:39.115Z"
confidence: 0.76
provenanceState: derived
---

# Pending Embeddings

When an embedding refresh fails, the affected page ids are written to a durable
pending list so the next run retries them rather than leaving a silently stale
index. ^[retrieval-pipelines.md:31-34]

The list is a write-ahead marker: ids are recorded BEFORE the refresh is attempted
and cleared only after it succeeds, so a crashed run is indistinguishable from a
failed one as far as recovery is concerned. ^[retrieval-pipelines.md:32-abc]

A reviewer asked for this page explicitly, and its second citation does not parse,
so it carries two held reasons at once. See [[Review Candidates]].
`;

/** A provenance lint finding attached to the pending-embeddings draft. */
const MALFORMED_CITATION_FINDING = {
  rule: "malformed-claim-citation",
  severity: "error",
  file: "candidate:pending-embeddings",
  message:
    "Malformed claim citation ^[retrieval-pipelines.md:32-abc] — expected file.md, " +
    "file.md:N-N, file.md:N,N-M,…, or file.md#LN-LN",
  line: 20,
};

/**
 * The pending review queue. Held reasons and review modes are deliberately
 * varied — one policy hold, one connector fetch, one double-reason manual hold —
 * so the reviews list has something to sort and differentiate by.
 */
export const CANDIDATE_DRAFTS = [
  {
    title: "Semantic Reranking",
    slug: "semantic-reranking",
    summary:
      "A second-pass scorer that reorders retrieved chunks before they reach the answer prompt",
    sources: ["retrieval-pipelines.md"],
    body: RERANKING_BODY,
    reviewMode: "policy",
    heldReasons: [{ code: "low-confidence", detail: "confidence 0.34 < 0.5" }],
    confidence: 0.34,
  },
  {
    title: "Connector Provenance",
    slug: "connector-provenance",
    summary:
      "Host-authored records of where connector-fetched material came from, attached before the material becomes a page",
    sources: ["review-gates.md"],
    body: CONNECTOR_BODY,
    reviewMode: "connector",
    heldReasons: [
      { code: "connector-fetched", detail: "fetched by the docs-site connector" },
      { code: "contradicted", detail: "contradicts provenance-metadata" },
    ],
    confidence: 0.81,
    contradicted: true,
  },
  {
    title: "Pending Embeddings",
    slug: "pending-embeddings",
    summary:
      "The durable retry list naming pages whose embedding refresh failed, drained by the next successful compile",
    sources: ["retrieval-pipelines.md"],
    body: EMBEDDINGS_BODY,
    reviewMode: "forced",
    heldReasons: [
      { code: "manual-review-requested", detail: "flagged during the retrieval review" },
      { code: "provenance-violating", detail: "malformed-claim-citation" },
    ],
    confidence: 0.76,
    provenanceViolations: [MALFORMED_CITATION_FINDING],
  },
];
