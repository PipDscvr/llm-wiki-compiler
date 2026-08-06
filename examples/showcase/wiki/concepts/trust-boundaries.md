---
title: Trust Boundaries
summary: The points where externally-supplied content crosses into the wiki, and the checks applied at each crossing
sources:
  - review-gates.md
kind: concept
orphaned: true
createdAt: "2026-07-14T09:22:32.771Z"
updatedAt: "2026-07-15T18:20:44.017Z"
tags:
  - review
  - security
aliases:
  - trust-boundaries
  - TB
confidence: 0.58
provenanceState: inferred
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Trust Boundaries

A **trust boundary** is any point where content the project did not author crosses into the wiki: an ingested URL, an imported bundle, a connector fetch, or a staged write from an agent. ^[review-gates.md:9-10]

## Marked orphaned by hand

This page carries `orphaned: true` in its frontmatter. It was superseded by material that now lives on [[Review Candidates]] and [[Held Reasons]], and it is kept only so the `orphaned-page` lint rule and the orphaned freshness state both have a real page to point at. ^[review-gates.md:54-57]

An explicitly-flagged page is treated differently from a page whose sources merely vanished. The frontmatter flag is a human decision — "this is retired" — while the computed orphaned state is a fact about the filesystem. See [[Page Freshness]]. ^[review-gates.md:52-57]

## Sources

review-gates.md
