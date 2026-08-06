---
title: Wikilinks
summary: Double-bracket references that connect concept pages into a navigable graph, resolved after page generation and validated by the linter
sources:
  - knowledge-compilation.md
  - review-gates.md
kind: concept
createdAt: "2026-07-14T09:22:13.550Z"
updatedAt: "2026-07-25T11:08:52.331Z"
tags:
  - linking
aliases:
  - wikilinks
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Wikilinks

**Wikilinks** are double-bracket references that connect one wiki page to another by title. They are the edges of the graph that [[Knowledge Compilation]] produces. ^[knowledge-compilation.md:37-39]

## When links are created

Links are not written by hand during page generation. They are added in the **interlink resolution** stage of the [[Compilation Pipeline]], after every page exists on disk, by rewriting concept mentions across the corpus into bracketed references. Doing it as a separate pass is what lets a page link to a concept that had not been generated yet when its own body was written. ^[knowledge-compilation.md:37-41]

## Dangling links

A link whose target has no page is *dangling*. The linter reports it as an error, and the viewer's graph still draws it — as a ghost node — because a missing page that three other pages point at is a gap worth seeing rather than an edge worth hiding. ^[knowledge-compilation.md:54-58]

There is one exception. A link whose target is sitting in the review queue is early rather than broken, and is reported as informational instead. See [[Review Candidates]]. ^[review-gates.md:47-50]

## Aliases

Pages carry an `aliases` list in frontmatter so a link written in the reader's own phrasing still resolves. Aliases are generated deterministically from the title, which keeps them stable across runs. ^[knowledge-compilation.md:43-47]

## Sources

knowledge-compilation.md, review-gates.md
