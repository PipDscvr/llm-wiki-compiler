---
title: Source Spans
summary: Line ranges inside a citation marker that narrow a claim from "somewhere in this document" to a specific handful of sentences
sources:
  - provenance-and-citations.md
kind: concept
createdAt: "2026-07-14T09:22:16.874Z"
updatedAt: "2026-07-29T08:03:19.511Z"
tags:
  - provenance
aliases:
  - source-spans
confidence: 0.84
provenanceState: derived
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Source Spans

A **source span** is the line range inside a [[Claim-Level Citations|citation marker]]. A paragraph-level citation tells you which document to read; a span tells you which sentences to read. ^[provenance-and-citations.md:27-30]

## Why the distinction matters

On long sources, "it's in the 90-page handbook somewhere" is not meaningfully different from no citation at all, so the span is the real unit of trust. ^[provenance-and-citations.md:29-30]

Spans are validated against the source file's actual length at lint time, and a span running off the end of its file is reported as broken — a citation pointing past the last line cannot have been checked by whoever wrote it. ^[provenance-and-citations.md:32-34]

## Deliberately malformed example

The showcase keeps one bad marker here so the `malformed-claim-citation` rule has something to catch. The following marker names a span that is not a number at all: ^[provenance-and-citations.md:pp32-34]

Real pages should never carry one. It is reproduced only so the health screen has a genuine error to report rather than a synthesised one.

## Sources

provenance-and-citations.md
