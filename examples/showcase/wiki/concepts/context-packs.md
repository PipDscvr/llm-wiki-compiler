---
title: Context Packs
sources: []
kind: concept
createdAt: "2026-07-18T11:02:31.008Z"
updatedAt: "2026-07-18T11:02:31.008Z"
tags:
  - agents
aliases:
  - context-packs
  - CP
---

# Context Packs

A **context pack** is a bundle of wiki material assembled for an agent to read: a ranked set of pages, their citations, and the graph neighbourhood around them.

This page is hand-authored rather than compiled — no source owns it, which is why its freshness resolves to *unverified* rather than fresh. ^[incremental-builds.md:47-49]

Its frontmatter deliberately omits `summary`, so the `missing-summary` lint rule has a genuine page to report. Everything else here is well-formed: the citation resolves, the links resolve, and the body is long enough to clear the empty-page floor. ^[incremental-builds.md:35-38]

Packs draw on the same ranking cascade as ordinary retrieval, described on [[Embedding Index]], and on the graph edges described on [[Wikilinks]]. ^[incremental-builds.md:31-33]

## Sources

incremental-builds.md
