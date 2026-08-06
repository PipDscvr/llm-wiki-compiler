---
title: How does incremental compilation save tokens?
summary: By hashing every source and re-extracting only the ones whose digest moved, so the expensive model call never runs over unchanged material.
type: query
createdAt: "2026-07-20T15:41:22.317Z"
---

# How does incremental compilation save tokens?

Because the expensive stage runs last, and it only runs over what changed.

Every source is hashed with SHA-256 after a successful run, and the digest is recorded alongside the concepts that source produced. On the next run each file is re-hashed and compared, which classifies it as new, changed, or unchanged before a single token is spent. ^[incremental-builds.md:16-23]

Concept extraction — the stage that calls the model — sits *after* that comparison in the [[Compilation Pipeline]], so unchanged sources never reach it. See [[Change Detection]] and [[Incremental Compilation]]. ^[knowledge-compilation.md:31-34]

The saving is not just money. Because ownership is recorded per source, an interrupted run resumes from where it stopped rather than restarting the corpus. ^[incremental-builds.md:53-56]

## Sources

incremental-builds.md, knowledge-compilation.md
