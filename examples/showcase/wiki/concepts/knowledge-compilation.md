---
title: Knowledge Compilation
summary: Treating a corpus of unstructured documents as build inputs and producing an interlinked reference wiki as deterministic, incremental output
sources:
  - knowledge-compilation.md
kind: concept
createdAt: "2026-07-14T09:22:10.114Z"
updatedAt: "2026-07-28T16:41:03.887Z"
tags:
  - pipeline
  - core
aliases:
  - knowledge-compilation
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Knowledge Compilation

**Knowledge compilation** treats a pile of unstructured documents the way a build system treats source code: raw material goes in, a deterministic pipeline runs over it, and an interlinked reference wiki comes out the other side. ^[knowledge-compilation.md:8-11]

## Why a compiler rather than a search box

Search returns documents; a compiler returns a structure. Once every concept worth naming has its own page, and every page names the pages it depends on, the reader navigates a graph instead of re-reading the same PDF a fourth time. ^[knowledge-compilation.md:13-18]

The metaphor also sets expectations correctly. Builds are incremental, builds are reproducible, and builds fail loudly when an input is missing — which is exactly the contract [[Incremental Compilation]] and [[Change Detection]] are built to honour. ^[knowledge-compilation.md:20-24]

## Stages

The work is split into six ordered stages, described in full on [[Compilation Pipeline]]: ingestion, change detection, concept extraction, page generation, interlink resolution, and index generation. ^[knowledge-compilation.md:26-41]

## Merged pages

A concept rarely lives in exactly one document. When several sources discuss the same idea the compiler merges their contributions into one page and records every contributing source in frontmatter — which is what makes the output a wiki rather than a pile of per-document summaries. ^[knowledge-compilation.md:43-47]

Merging has a cost. A merged page is owned by several sources at once, so editing any one of them makes the page stale, and that ownership is recorded explicitly rather than inferred from the body. ^[knowledge-compilation.md:49-52]

## What the compiler refuses to do

It never invents a citation: a claim that cannot be traced to a span in an ingested source is dropped or marked inferred, and the linter counts inferred paragraphs so a drifting page is visible before a reader trusts it. See [[Claim-Level Citations]]. ^[knowledge-compilation.md:54-58]

It also never silently overwrites a human edit — pages that fail a policy check become [[Review Candidates]] instead of being written live. ^[knowledge-compilation.md:60-61]

## Sources

knowledge-compilation.md
