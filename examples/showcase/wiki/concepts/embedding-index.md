---
title: Embedding Index
summary: The per-chunk vector store that backs retrieval, rebuilt incrementally from the same ownership map the compiler uses
sources:
  - retrieval-pipelines.md
kind: concept
createdAt: "2026-07-14T09:22:29.660Z"
updatedAt: "2026-07-22T14:31:56.014Z"
tags:
  - retrieval
aliases:
  - embedding-index
  - EI
confidence: 0.79
provenanceState: derived
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Embedding Index

The **embedding index** stores one vector per chunk, alongside that chunk's page id, heading trail, and character offsets. Keeping the offsets is what lets a retrieved chunk be rendered back as a citation span. ^[retrieval-pipelines.md:27-29]

## Staying current

The store is rebuilt incrementally from the same ownership map the compiler uses: when a page changes, only its chunks are re-embedded. A failed refresh writes the affected page ids to a durable pending list so the next run retries them rather than leaving a silently stale index. ^[retrieval-pipelines.md:31-34]

## Ranking cascade

Retrieval runs in three passes — a vector pre-filter over pages, a chunk-level narrowing, and a rerank that keeps roughly a dozen chunks. Each pass is cheaper than the one it feeds, so the expensive comparison only ever runs over a short list. ^[retrieval-pipelines.md:38-44]

## Operational notes

This section is deliberately unsupported. It reads plausibly, cites nothing, and exists so the `excess-inferred-paragraphs` rule has something real to catch on the health screen.

Index size grows roughly linearly with corpus size, and a project of a few thousand chunks stays comfortably inside a single JSON store on disk. Rebuilds are cheap enough that operators rarely bother scheduling them.

Cosine similarity is the usual metric, though dot product over normalised vectors is equivalent and marginally faster. Neither choice materially changes which chunks come back for a well-formed question.

Where retrieval quality does move, it moves because of [[Semantic Chunking]] boundaries rather than because of the vector store itself.

## Sources

retrieval-pipelines.md
