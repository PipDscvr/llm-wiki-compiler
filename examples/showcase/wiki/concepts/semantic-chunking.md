---
title: Semantic Chunking
summary: Cutting pages into retrieval units on heading and paragraph boundaries, with a target size plus hard ceiling and floor
sources:
  - retrieval-pipelines.md
kind: concept
createdAt: "2026-07-14T09:22:28.002Z"
updatedAt: "2026-07-22T14:31:55.902Z"
tags:
  - retrieval
aliases:
  - semantic-chunking
  - SC
confidence: 0.87
provenanceState: derived
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Semantic Chunking

Whole pages are the wrong retrieval unit: a long page dilutes its own relevance score, and pasting it whole burns context on paragraphs that have nothing to do with the question. **Semantic chunking** is the fix. ^[retrieval-pipelines.md:15-17]

## Boundaries and sizes

Chunks are cut on semantic boundaries — headings first, then paragraph breaks — and aimed at roughly 800 characters. A hard ceiling of 1,400 characters keeps a runaway section from producing one enormous chunk, and a floor of 200 characters merges trailing fragments back into their predecessor so the index does not fill with orphaned sentences. ^[retrieval-pipelines.md:19-23]

## Why it feeds citations

Because each chunk keeps its character offsets, a retrieved chunk can be rendered back as a [[Source Spans|source span]] rather than as an anonymous blob of text. Chunking is therefore a provenance decision as much as a retrieval one. ^[retrieval-pipelines.md:27-29]

## Related

[[Embedding Index]] covers where the chunks are stored and how the store is kept current.

## Sources

retrieval-pipelines.md
