---
title: Incremental Compilation
summary: Making the cost of a recompile proportional to the size of the change, by reprocessing only the sources whose content hash moved
sources:
  - incremental-builds.md
  - knowledge-compilation.md
kind: concept
createdAt: "2026-07-14T09:22:21.665Z"
updatedAt: "2026-07-30T13:55:41.338Z"
tags:
  - incremental
aliases:
  - incremental-compilation
  - IC
confidence: 0.9
provenanceState: derived
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Incremental Compilation

Recompiling a whole corpus because one paragraph changed is expensive in a build system and ruinous in a pipeline that bills per token. **Incremental compilation** exists to make the cost of a change proportional to the size of the change. ^[incremental-builds.md:9-12]

## The mechanism

Only sources whose digest moved are re-extracted, which is why [[Change Detection]] runs before the model is ever called. Everything downstream — page generation, interlinking, indexing — then operates on the small set of concepts that actually moved. ^[incremental-builds.md:16-19]

## Ownership makes it safe

Skipping unchanged sources is only safe because the state file records which concepts each source produced. That ownership map is what makes a merged page's status computable at all, and it is authoritative — freshness is never inferred from the page body or from frontmatter dates, both of which are trivially wrong after a hand edit. ^[incremental-builds.md:31-38]

Merged pages are the reason this matters in practice. A page assembled from several sources is owned by all of them at once, so editing any one of them is enough to make the page stale. ^[knowledge-compilation.md:49-52]

## Partial runs

State is written per source rather than once at the end, so an interrupted run only reprocesses the sources it had not finished. A compile journal records what was in flight, and an incomplete journal surfaces as a lint warning so a project never reads clean while partial state sits on disk. ^[incremental-builds.md:53-56]

## Sources

incremental-builds.md, knowledge-compilation.md
