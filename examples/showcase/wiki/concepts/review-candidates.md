---
title: Review Candidates
summary: JSON records holding a generated page out of the wiki until a human approves it, carrying the full rendered body so approval is a pure copy
sources:
  - review-gates.md
kind: concept
createdAt: "2026-07-14T09:22:24.883Z"
updatedAt: "2026-08-01T10:12:07.664Z"
tags:
  - review
  - core
aliases:
  - review-candidates
  - RC
confidence: 0.93
provenanceState: derived
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Review Candidates

Generated pages are proposals. A **review candidate** is the record that keeps a proposal out of the wiki until a human has agreed to it. ^[review-gates.md:9-10]

## What the record carries

A held page is written to the private candidate store as JSON rather than into the wiki tree. The record carries the full rendered body, so approving it later is a pure file copy — the model is never called a second time and the reviewer approves exactly the bytes they read. ^[review-gates.md:14-17]

Each candidate also carries the per-source state snapshot captured at generation time. Approving it writes that snapshot into project state, which is what stops an approved page from being regenerated on the very next run. See [[Incremental Compilation]]. ^[review-gates.md:19-22]

## Links into the queue

A wikilink whose target is still in the queue is early rather than broken, and the linter reports it as informational so a reviewer working through a batch is not drowned in errors that resolve themselves on the next approval. ^[review-gates.md:47-50]

This page links to [[Semantic Reranking]] for exactly that reason: the page does not exist yet, but a candidate for it is sitting in this project's review queue.

## Rejection is archival

Rejecting a candidate moves it into an archive directory instead of deleting it, so the proposal, its [[Held Reasons]], and its citations stay auditable. ^[review-gates.md:54-57]

## Sources

review-gates.md
