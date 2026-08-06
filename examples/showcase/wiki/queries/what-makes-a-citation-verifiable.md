---
title: What makes a citation verifiable?
summary: A named line span in a file that still exists — the span narrows the claim to a few sentences, and existence is what the linter checks.
type: query
createdAt: "2026-07-24T09:18:03.556Z"
---

# What makes a citation verifiable?

Two things: a span, and a file that still exists.

A paragraph-level citation tells you which document to read. A span tells you which sentences to read, and on a long source those are very different offers — "somewhere in the 90-page handbook" is close to no citation at all. See [[Source Spans]]. ^[provenance-and-citations.md:27-30]

Spans are checked against the source's real length, so a range running past the last line is reported as broken rather than accepted. A citation pointing past the end of a file cannot have been checked by whoever wrote it. ^[provenance-and-citations.md:32-34]

Existence is the second half. A citation resolves only while the file it names is still under `sources/`, which is why deleting a source drops the traceability figure instead of quietly tidying the page. See [[Claim-Level Citations]]. ^[provenance-and-citations.md:36-44]

## Sources

provenance-and-citations.md
