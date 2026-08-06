---
title: Provenance Metadata
summary: The confidence and contradiction signals carried in page frontmatter, surfaced as lint warnings rather than silent properties
sources:
  - provenance-and-citations.md
kind: concept
createdAt: "2026-07-14T09:22:18.330Z"
updatedAt: "2026-07-29T08:03:19.640Z"
tags:
  - provenance
  - review
aliases:
  - provenance-metadata
confidence: 0.72
provenanceState: derived
contradictedBy:
  - slug: held-reasons
    reason: "Treats a missing confidence value as acceptable, where this page treats it as a hold-worthy signal"
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Provenance Metadata

Beyond [[Claim-Level Citations]], two further trust signals ride in page frontmatter: a `confidence` number recording how well supported the page was at generation time, and a `contradictedBy` list naming pages whose evidence disagrees with this one. ^[provenance-and-citations.md:46-52]

## Confidence

A low confidence value is a lint warning rather than a silent property, so a weakly supported page announces itself instead of blending in with the rest of the corpus. The threshold is a project setting, and pages below it are candidates for a [[Held Reasons|policy hold]] as well. ^[provenance-and-citations.md:48-50]

## Contradiction

A `contradictedBy` entry names another page and says why the two disagree, so a reader meets the conflict rather than trusting whichever page they happened to open first. ^[provenance-and-citations.md:50-52]

Neither field is authoritative on its own — both are prompts for a human to look closer, which is why each surfaces as a warning rather than an error. ^[provenance-and-citations.md:54-56]

## Not yet written

This page deliberately links to [[Semantic Drift]], a concept named in the backlog but never compiled, so that the `broken-wikilink` rule has a genuine dangling edge to report and the graph has a ghost node to draw.

## Sources

provenance-and-citations.md
