# Showcase Example

A deliberately fully-populated llmwiki project. Every viewer surface has real
data in it: concepts, sources, saved queries, a pending review queue, a mixed
freshness picture, and a lint report that fires eleven different rules.

`examples/basic/` is real, clean output from one source. This one is the
opposite — it is staged so that nothing in the viewer renders as a zero, an
em-dash, or an empty state.

## What's here

```
sources/                              ← 5 ingested source documents
  knowledge-compilation.md
  provenance-and-citations.md
  incremental-builds.md
  review-gates.md
  retrieval-pipelines.md              ← "edited since the last compile"

wiki/
  concepts/                           ← 17 interlinked concept pages
  queries/                            ← 4 saved query answers
  index.md                            ← generated table of contents

seed.mjs                              ← generates .llmwiki/ (see below)
seed-data.mjs                         ← the source-ownership map
seed-candidates.mjs                   ← the six review-candidate drafts
ts-loader.mjs                         ← lets seed.mjs import llmwiki's sources
```

The pages under `queries/` carry exactly the frontmatter `llmwiki query --save`
writes — `title`, `summary`, `type: query`, `createdAt`, and nothing else. That
is deliberately narrower than a compiled concept page, which also carries `kind`,
`sources`, and `updatedAt`. A fixture that quietly added those fields would make
saved queries look healthier here than they are anywhere else.

A sixth source, `legacy-import-notes.md`, is recorded in the project state but
is **not** on disk. It was deleted after the last compile, which is what makes
`okf-bundles.md` orphaned and its citations unresolvable.

## Run it

```bash
# once, from the repo root
npm run build

# generate .llmwiki/ (no API key, no network, safe to re-run)
node examples/showcase/seed.mjs

# then browse it
cd examples/showcase
llmwiki view --open
```

`llmwiki lint`, `llmwiki status`, and `llmwiki review list` all work in that
directory too, and none of them need a model.

## Why `.llmwiki/` is generated, not committed

This repo's `.gitignore` ignores `.llmwiki/` everywhere, so the example cannot
ship its state file, its review queue, or its lint cache as tracked files. It
ships the recipe instead.

`seed.mjs` writes all three, and it writes them through llmwiki's own code
rather than hand-rolling the JSON:

| Artifact | Written by |
| --- | --- |
| `.llmwiki/state.json` | `writeState` from `src/utils/state.ts` |
| `.llmwiki/candidates/*.json` | `writeCandidate` from `src/compiler/candidates.ts` |
| `.llmwiki/last-lint.json` | a real `llmwiki lint` run |

That matters because all three formats belong to the compiler. A hand-written
fixture would silently rot the first time one of them changed; going through
the real writers means the example breaks loudly instead, or not at all.

The script only ever writes inside `examples/showcase/`, derives every path
from its own location rather than the working directory, and is idempotent —
running it twice leaves the same six candidates and the same state file.

It needs no API key. Nothing it produces requires a model: hashes are
mechanical, ownership is declared in `seed-data.mjs`, the candidate drafts are
written out in `seed-candidates.mjs`, and `llmwiki lint` is a pure
static-analysis pass.

## What it demonstrates

### Freshness in four states

Freshness is derived from `.llmwiki/state.json` — which sources own which
pages, and whether each source still hashes to its recorded digest. The
health screen draws one bar per concept page, so this project shows four
colours rather than a wall of green:

| State | Pages | Why |
| --- | --- | --- |
| `fresh` | 11 | Every owning source is present and unchanged |
| `stale` | 2 | `retrieval-pipelines.md` records a digest that no longer matches the file |
| `orphaned` | 2 | One page's only source was deleted; one page is flagged `orphaned: true` |
| `unverified` | 2 | Hand-authored pages that no source claims |

`wikilinks.md` is owned by two sources at once, which is the merged-page case
the freshness rules exist for.

### A review queue with varied hold reasons

Six candidates covering every held-reason code in `src/review/policy.ts`, all
four review modes, and both approval targets — so the reviews list has real
range to sort and filter by, and `llmwiki review show` has real bodies to read:

| Candidate | Mode | Held reasons | Approves into |
| --- | --- | --- | --- |
| Semantic Reranking | `policy` | `low-confidence` | `concepts/` |
| Connector Provenance | `connector` | `connector-fetched`, `contradicted` | `concepts/` |
| Pending Embeddings | `forced` | `manual-review-requested`, `provenance-violating` | `concepts/` |
| Chunk Boundaries | `policy` | `schema-violating` | `concepts/` |
| Merged Page Ownership | `policy` | `all` | `concepts/` |
| What happens when a source is deleted? | `imported` | `imported-okf` | `queries/` |

Merged Page Ownership is the interesting one: nothing is wrong with it. It is
queued only because the project holds every generated page, which is exactly
what the `all` code is for — a clean draft and a broken one look identical in
the queue until you read the reason.

`review-candidates.md` links to `[[Semantic Reranking]]` — a page that only
exists in the queue. That link is reported as *informational*, not broken,
which is the behaviour the `pending-target` rule exists to produce.

### Eleven lint rules, on purpose

Each problem below is deliberate and lives on exactly one page, so the health
screen's rule table and stacked severity bar have a real spread to render.

| Rule | Severity | Where | How it fires |
| --- | --- | --- | --- |
| `broken-wikilink` | error | `provenance-metadata.md` | Links to `[[Semantic Drift]]`, which was never compiled |
| `broken-citation` | error | `okf-bundles.md` | Cites `legacy-import-notes.md`, a deleted source |
| `malformed-claim-citation` | error | `source-spans.md` | Carries a span suffix that is not a line number |
| `stale-page` | warning | `semantic-chunking.md`, `embedding-index.md` | Their source's recorded digest no longer matches |
| `orphaned-page` | warning | `okf-bundles.md`, `trust-boundaries.md` | Sources deleted, and an explicit `orphaned: true` flag |
| `missing-summary` | warning | `context-packs.md` | Frontmatter omits `summary` |
| `empty-page` | warning | `vector-store.md` | A stub whose body is under 50 characters |
| `low-confidence` | warning | `held-reasons.md` | Frontmatter declares `confidence: 0.41` |
| `contradicted-page` | warning | `provenance-metadata.md` | Frontmatter names a page whose evidence disagrees |
| `excess-inferred-paragraphs` | warning | `embedding-index.md` | Four consecutive prose paragraphs cite nothing |
| `pending-target` | info | `review-candidates.md` | Links to a page still sitting in the review queue |

### Traceability below 100%

The three citations on `okf-bundles.md` name a source file that is no longer in
`sources/`, so they cannot resolve. The viewer's traceability meter reports the
resolvable share rather than rounding up to a clean 100%.

## Reproduce the content itself

The `sources/` and `wiki/` trees here are hand-authored to hit specific code
paths — they are not raw LLM output, and re-compiling them would produce
different (and much cleaner) pages. If you want real generated output from a
real model, use `examples/basic/` instead.
