---
title: Claim-Level Citations
summary: Caret-bracket markers that bind a paragraph to a named line span in a source file, so a reader can verify a claim in one click
sources:
  - provenance-and-citations.md
kind: concept
createdAt: "2026-07-14T09:22:15.201Z"
updatedAt: "2026-07-29T08:03:19.402Z"
tags:
  - provenance
  - core
aliases:
  - claim-level-citations
  - CLC
confidence: 0.91
provenanceState: derived
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Claim-Level Citations

A generated page is only as useful as the reader's ability to check it, and the citation format exists so that checking takes one click rather than one afternoon. ^[provenance-and-citations.md:8-11]

## The grammar

Citations are caret-bracket markers appended to the paragraph they support. Four forms are recognised — a bare filename, a colon span, several disjoint colon spans, and the GitHub-style hash-anchor span. Everything else that contains a colon or a hash is malformed. ^[provenance-and-citations.md:13-21]

The linter reports a malformed marker rather than quietly dropping it, because a dropped marker is the worse failure: it converts an unverifiable claim into one that merely looks clean. ^[provenance-and-citations.md:23-25]

## Resolution

A citation resolves while the file it names still exists under `sources/`. Delete the source and every citation naming it stops resolving, which is what drives the viewer's traceability meter below 100% until the affected pages are recompiled or retired. ^[provenance-and-citations.md:36-40]

That behaviour is deliberate. Pruning the citation alongside the source would leave a confident, uncited paragraph behind and no record that its evidence ever existed. ^[provenance-and-citations.md:42-44]

## Related

[[Source Spans]] covers the span syntax itself; [[Provenance Metadata]] covers the confidence and contradiction signals that ride alongside citations in frontmatter.

## Sources

provenance-and-citations.md
