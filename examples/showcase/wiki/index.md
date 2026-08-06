# Knowledge Wiki

## Concepts

- **[[change-detection|Change Detection]]** — Comparing SHA-256 digests of every source against the digests recorded by the previous run to classify each file as new, changed, or deleted
- **[[claim-level-citations|Claim-Level Citations]]** — Caret-bracket markers that bind a paragraph to a named line span in a source file, so a reader can verify a claim in one click
- **[[compilation-pipeline|Compilation Pipeline]]** — The six ordered stages that turn ingested sources into an interlinked wiki — ingestion, change detection, extraction, generation, interlinking, and indexing
- **[[context-packs|Context Packs]]** — 
- **[[embedding-index|Embedding Index]]** — The per-chunk vector store that backs retrieval, rebuilt incrementally from the same ownership map the compiler uses
- **[[held-reasons|Held Reasons]]** — The structured policy codes recording why a generated page was kept out of the wiki, so the review queue can be sorted rather than skimmed
- **[[incremental-compilation|Incremental Compilation]]** — Making the cost of a recompile proportional to the size of the change, by reprocessing only the sources whose content hash moved
- **[[knowledge-compilation|Knowledge Compilation]]** — Treating a corpus of unstructured documents as build inputs and producing an interlinked reference wiki as deterministic, incremental output
- **[[okf-bundles|OKF Bundles]]** — Portable Open Knowledge Format archives that carry a compiled wiki, its sources, and its provenance between projects
- **[[page-freshness|Page Freshness]]** — The four-state classification — fresh, stale, orphaned, unverified — derived on demand from recorded source digests rather than persisted
- **[[provenance-metadata|Provenance Metadata]]** — The confidence and contradiction signals carried in page frontmatter, surfaced as lint warnings rather than silent properties
- **[[review-candidates|Review Candidates]]** — JSON records holding a generated page out of the wiki until a human approves it, carrying the full rendered body so approval is a pure copy
- **[[semantic-chunking|Semantic Chunking]]** — Cutting pages into retrieval units on heading and paragraph boundaries, with a target size plus hard ceiling and floor
- **[[source-spans|Source Spans]]** — Line ranges inside a citation marker that narrow a claim from "somewhere in this document" to a specific handful of sentences
- **[[vector-store|Vector Store]]** — Stub page kept as a placeholder for the storage layer beneath the embedding index
- **[[wikilinks|Wikilinks]]** — Double-bracket references that connect concept pages into a navigable graph, resolved after page generation and validated by the linter

## Saved Queries

- **[[how-do-i-tell-if-a-page-has-gone-stale|How do I tell if a page has gone stale?]]** — Compare each owning source's current digest against the digest recorded at compile time — the wiki reports fresh, stale, orphaned, or unverified.
- **[[how-does-incremental-compilation-save-tokens|How does incremental compilation save tokens?]]** — By hashing every source and re-extracting only the ones whose digest moved, so the expensive model call never runs over unchanged material.
- **[[what-makes-a-citation-verifiable|What makes a citation verifiable?]]** — A named line span in a file that still exists — the span narrows the claim to a few sentences, and existence is what the linter checks.
- **[[when-should-a-page-be-held-for-review|When should a page be held for review?]]** — Whenever a structured policy signal fires — low confidence, a declared contradiction, a schema breach, or a citation that does not check out.

_20 pages | Generated 2026-08-06T11:52:16.923Z_
