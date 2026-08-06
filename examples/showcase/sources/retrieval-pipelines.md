---
title: retrieval pipelines
source: examples/showcase/sources/retrieval-pipelines.md
ingestedAt: "2026-07-14T09:19:58.000Z"
---

# Retrieval Pipelines

Answering a question over a compiled wiki is a retrieval problem before it is a
generation problem. The quality ceiling is set by what gets into the context
window, not by what the model does with it.

## Chunking

Whole pages are the wrong retrieval unit. A long page dilutes its own relevance
score, and pasting it whole burns context on paragraphs that have nothing to do
with the question.

Chunks are cut on semantic boundaries — headings first, then paragraph breaks —
and aimed at roughly 800 characters. A hard ceiling of 1,400 characters keeps a
runaway section from producing one enormous chunk, and a floor of 200
characters merges trailing fragments back into their predecessor so the index
does not fill with orphaned sentences.

## The index

Each chunk is embedded once and stored with its page id, its heading trail, and
its character offsets. Storing the offsets is what lets a retrieved chunk be
rendered back as a citation span instead of as an anonymous blob of text.

The store is rebuilt incrementally from the same ownership map the compiler
uses. When a page changes, only its chunks are re-embedded. When an embedding
refresh fails, the affected page ids are written to a durable pending list so
the next run retries them rather than leaving a silently stale index.

## Ranking

Retrieval runs in three passes. A vector pre-filter takes the top fifteen pages
by cosine similarity. A chunk-level pass narrows those to thirty candidate
chunks. A rerank pass keeps twelve, which is roughly what fits alongside a
system prompt and an answer budget.

Each pass is cheaper than the one it feeds, which is the whole point of the
cascade: the expensive comparison only ever runs over a short list.

## Saved answers

An answer worth keeping can be saved back into the wiki as a query page. Query
pages sit beside concept pages and are indexed the same way, so a good answer
becomes retrievable material for the next question.

Query pages are deliberately never assigned a freshness status. No source owns
them — they are records of what was asked and what was answered at a point in
time, not projections of a document that could go stale underneath them.
