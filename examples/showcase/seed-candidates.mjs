/**
 * @file examples/showcase/seed-candidates.mjs
 * @description The six pending review candidates `seed.mjs` feeds into
 * llmwiki's own `writeCandidate`.
 *
 * Split out of `seed-data.mjs` for the same reason that file was split out of
 * `seed.mjs`: the drafts carry full rendered page bodies, so they grow much
 * faster than the state map they used to sit beside, and neither file should
 * drift past the project's size budget.
 *
 * WHY six, and why these six: between them they exercise every held-reason code
 * in `src/review/policy.ts`, all four `reviewMode` values, and BOTH approval
 * targets (`concepts` and `queries`). A reviewer opening `llmwiki review list`
 * against this example sees the full range of held-reason chips rather than one
 * code repeated, and can approve into either wiki subdirectory.
 *
 * The bodies are written as genuine extraction output: real prose about this
 * example's own sources, with real `^[file.md:lines]` markers whose spans point
 * at lines that actually exist in `examples/showcase/sources/`. Every timestamp
 * is a fixed literal so re-seeding is a no-op diff.
 */

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

const CHUNK_BODY = `---
title: Chunk Boundaries
summary: The semantic cut points and size envelope that decide how a page is split before any of it is embedded
sources:
  - retrieval-pipelines.md
kind: concept
createdAt: "2026-08-04T15:02:48.330Z"
updatedAt: "2026-08-04T15:02:48.330Z"
confidence: 0.88
provenanceState: extracted
---

# Chunk Boundaries

A whole page is the wrong unit to retrieve. A long page dilutes its own relevance
score, and pasting it in whole spends the context window on paragraphs that have
nothing to do with the question. ^[retrieval-pipelines.md:15-17]

Cuts are taken on semantic boundaries — headings first, then paragraph breaks —
and aimed at roughly 800 characters. A 1,400-character ceiling stops a runaway
section from becoming one enormous chunk, and a 200-character floor merges
trailing fragments back into their predecessor, so the index does not fill up
with orphaned sentences. ^[retrieval-pipelines.md:19-23]

Each chunk is stored with its page id, its heading trail, and its character
offsets. The offsets are the load-bearing part: they are what lets a retrieved
chunk be rendered back as a citation span instead of as an anonymous blob of
text. See [[Embedding Index]]. ^[retrieval-pipelines.md:27-29]
`;

const OWNERSHIP_BODY = `---
title: Merged Page Ownership
summary: The state file's record of which sources produced which page, and why a page owned by several sources goes stale when any one of them moves
sources:
  - knowledge-compilation.md
  - incremental-builds.md
kind: concept
createdAt: "2026-08-05T09:26:17.044Z"
updatedAt: "2026-08-05T09:26:17.044Z"
confidence: 0.91
provenanceState: derived
---

# Merged Page Ownership

A concept rarely lives in exactly one document. When several sources discuss the
same idea the compiler merges their contributions into a single page and records
every contributing source in that page's frontmatter — which is what makes the
output a wiki rather than a per-document summary pile.
^[knowledge-compilation.md:45-48]

Merging has a cost. A merged page is owned by several sources at once, so editing
any one of them makes the merged page stale. The state file records that
ownership explicitly rather than inferring it from the page body. See
[[Compilation Pipeline]] and [[Wikilinks]]. ^[knowledge-compilation.md:50-52]

That map is what makes a merged page's freshness computable at all: the page is
fresh only while every source that owns it still exists and still hashes to its
recorded digest. See [[Page Freshness]] and [[Change Detection]].
^[incremental-builds.md:31-33]
`;

const DELETED_SOURCE_BODY = `---
title: What happens when a source is deleted?
summary: Its citations stop resolving and the traceability figure drops — the citation is deliberately left behind rather than pruned along with the file
sources:
  - provenance-and-citations.md
  - "okf:showcase-provenance-bundle"
kind: concept
createdAt: "2026-08-02T11:07:33.902Z"
updatedAt: "2026-07-31T18:40:05.117Z"
provenanceState: imported
---

# What happens when a source is deleted?

Its citations stop resolving, and the wiki says so out loud.

A citation resolves only while the file it names is still present under
\`sources/\`. Delete that file and every citation naming it stops resolving, so the
viewer's traceability figure drops below 100% until the pages that depended on it
are recompiled or retired. See [[Claim-Level Citations]].
^[provenance-and-citations.md:40-43]

The citation is not pruned along with the source, and that is deliberate. Pruning
would leave a confident, uncited paragraph behind and no record that its evidence
ever existed — a page that reads clean and cannot be checked.
^[provenance-and-citations.md:45-47]

The page itself is reported as orphaned rather than removed, so retiring it stays
a human decision. See [[Page Freshness]] and [[OKF Bundles]].
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
 * A schema lint finding attached to the chunk-boundaries draft. Shaped exactly
 * like the linter's own output for this rule (see `rules-crosslinks.ts`), which
 * carries no `line` — the shortfall is a property of the page, not of one line.
 */
const CROSS_LINK_FINDING = {
  rule: "schema-cross-link-minimum",
  severity: "warning",
  file: "candidate:chunk-boundaries",
  message: 'Page kind "concept" requires at least 3 [[wikilinks]] but only 1 found.',
};

/**
 * The pending review queue. Held reasons, review modes, and approval targets are
 * deliberately varied so the reviews list has something to sort, filter, and
 * differentiate by — see this file's header for the coverage this is chosen to
 * give.
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
  {
    title: "Chunk Boundaries",
    slug: "chunk-boundaries",
    summary:
      "The semantic cut points and size envelope that decide how a page is split before any of it is embedded",
    sources: ["retrieval-pipelines.md"],
    body: CHUNK_BODY,
    reviewMode: "policy",
    heldReasons: [
      { code: "schema-violating", detail: "1 of 3 required cross-links" },
    ],
    confidence: 0.88,
    schemaViolations: [CROSS_LINK_FINDING],
  },
  {
    title: "Merged Page Ownership",
    slug: "merged-page-ownership",
    summary:
      "The state file's record of which sources produced which page, and why a page owned by several sources goes stale when any one of them moves",
    sources: ["knowledge-compilation.md", "incremental-builds.md"],
    body: OWNERSHIP_BODY,
    reviewMode: "policy",
    // Nothing is wrong with this draft. It is queued because the project runs
    // `review.hold = all`, which is the case the `all` code exists for — a clean
    // page in the queue looks identical to a held one until you read the reason.
    heldReasons: [{ code: "all", detail: "review.hold = all — every generated page is queued" }],
    confidence: 0.91,
  },
  {
    title: "What happens when a source is deleted?",
    slug: "what-happens-when-a-source-is-deleted",
    summary:
      "Its citations stop resolving and the traceability figure drops — the citation is deliberately left behind rather than pruned along with the file",
    sources: ["provenance-and-citations.md"],
    body: DELETED_SOURCE_BODY,
    reviewMode: "imported",
    heldReasons: [
      { code: "imported-okf", detail: "arrived in bundle showcase-provenance-bundle" },
    ],
    // The one candidate that approves into `wiki/queries/` rather than
    // `wiki/concepts/`. An imported OKF query doc is the path that sets this, so
    // it is also the candidate that carries `okfPath`.
    targetDirectory: "queries",
    okfPath: "docs/queries/what-happens-when-a-source-is-deleted.md",
  },
];
