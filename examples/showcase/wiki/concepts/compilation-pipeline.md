---
title: Compilation Pipeline
summary: The six ordered stages that turn ingested sources into an interlinked wiki — ingestion, change detection, extraction, generation, interlinking, and indexing
sources:
  - knowledge-compilation.md
kind: concept
createdAt: "2026-07-14T09:22:11.902Z"
updatedAt: "2026-07-28T16:41:04.010Z"
tags:
  - pipeline
aliases:
  - compilation-pipeline
  - CP
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Compilation Pipeline

The **compilation pipeline** is the ordered sequence of stages that [[Knowledge Compilation]] runs to turn raw sources into wiki pages. ^[knowledge-compilation.md:26-27]

## The six stages

1. **Ingestion** collects raw sources — files, URLs, transcripts, images — into one `sources/` directory with normalised frontmatter. ^[knowledge-compilation.md:28-30]
2. **Change detection** hashes every source and compares it against the state recorded by the previous run. See [[Change Detection]]. ^[knowledge-compilation.md:31-32]
3. **Concept extraction** asks a model to name the concepts a changed source actually teaches, with a one-line summary for each. ^[knowledge-compilation.md:33-34]
4. **Page generation** writes one markdown page per concept, carrying its claims back to specific line spans in the sources. ^[knowledge-compilation.md:35-36]
5. **Interlink resolution** rewrites concept mentions across the corpus into wikilinks so the pages form a navigable graph. See [[Wikilinks]]. ^[knowledge-compilation.md:37-39]
6. **Index generation** rebuilds the table of contents from whatever pages now exist on disk. ^[knowledge-compilation.md:40-41]

## Ordering is not incidental

Extraction has to follow change detection, because extraction is the expensive stage and the whole point of hashing is to skip it. Interlink resolution has to follow generation, because a link can only be resolved once both endpoints exist on disk. ^[knowledge-compilation.md:20-24]

Index generation runs last and reads the filesystem rather than the run's own bookkeeping, so a page written by an earlier run — or approved from the review queue between runs — still appears. ^[knowledge-compilation.md:40-41]

## Sources

knowledge-compilation.md
