---
title: knowledge compilation
source: examples/showcase/sources/knowledge-compilation.md
ingestedAt: "2026-07-14T09:12:44.000Z"
---

# Knowledge Compilation

Knowledge compilation treats a pile of unstructured documents the way a build
system treats source code. Raw material goes in, a deterministic pipeline runs
over it, and an interlinked reference wiki comes out the other side.

## Why a compiler, not a search box

Search returns documents. A compiler returns a structure. When every concept
worth naming has its own page, and every page names the other pages it depends
on, the reader navigates a graph instead of re-reading the same PDF for the
fourth time.

The compiler metaphor also sets the expectations correctly. Builds are
incremental, builds are reproducible, and builds fail loudly when an input is
missing. A knowledge compiler that silently produced a slightly different wiki
on every run would be useless for the same reason a non-deterministic C
compiler would be.

## Pipeline stages

The pipeline runs in six ordered stages:

1. **Ingestion** collects raw sources — files, URLs, transcripts, images — into
   a single `sources/` directory with normalised frontmatter.
2. **Change detection** hashes every source and compares it against the state
   recorded by the previous run.
3. **Concept extraction** asks a model to name the concepts a changed source
   actually teaches, with a one-line summary for each.
4. **Page generation** writes one markdown page per concept, carrying its
   claims back to specific line spans in the sources.
5. **Interlink resolution** rewrites concept mentions across the corpus into
   wikilinks so the pages form a navigable graph.
6. **Index generation** rebuilds the table of contents from whatever pages now
   exist on disk.

## Merged pages

A concept rarely lives in exactly one document. When several sources discuss
the same idea, the compiler merges their contributions into a single page and
records every contributing source in that page's frontmatter. This is what
makes the output a wiki rather than a per-document summary pile.

Merging has a cost. A merged page is owned by several sources at once, so
editing any one of them makes the merged page stale. The state file records
that ownership explicitly rather than inferring it from the page body.

## What the compiler refuses to do

The compiler never invents a citation. If a claim cannot be traced to a span in
an ingested source, the claim is either dropped or marked as inferred, and the
linter counts inferred paragraphs so a page that has drifted into speculation
is visible before a reader trusts it.

It also never silently overwrites a page a human has edited. Pages that fail a
policy check are staged as review candidates instead of being written live.
