---
title: Held Reasons
summary: The structured policy codes recording why a generated page was kept out of the wiki, so the review queue can be sorted rather than skimmed
sources:
  - review-gates.md
kind: concept
createdAt: "2026-07-14T09:22:26.410Z"
updatedAt: "2026-08-01T10:12:07.781Z"
tags:
  - review
aliases:
  - held-reasons
  - HR
confidence: 0.41
provenanceState: inferred
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Held Reasons

**Held reasons** are the structured codes recording why a page became a [[Review Candidates|review candidate]]. They are codes rather than free text so the queue can be sorted and filtered instead of skimmed. ^[review-gates.md:26-27]

## The policy codes

- `low-confidence` — generation-time confidence fell below the threshold. ^[review-gates.md:29]
- `contradicted` — frontmatter names pages that disagree with this one. ^[review-gates.md:30]
- `schema-violating` — the body breaks a declared per-kind rule, most often the minimum cross-link count. ^[review-gates.md:31-32]
- `provenance-violating` — a citation is malformed, out of bounds, or names a file absent from `sources/`. ^[review-gates.md:33-34]
- `all` — the project holds every generated page regardless of signal. ^[review-gates.md:35]
- `manual-review-requested` — a human asked for this one specifically. ^[review-gates.md:36]
- `imported-okf` — the page arrived through a bundle import. ^[review-gates.md:37-38]
- `connector-fetched` — the page was built from connector-pulled data. ^[review-gates.md:39]

## Several at once

A candidate can carry more than one code, and the queue shows all of them, because "held for two independent reasons" is a different situation from "held because someone passed a flag". ^[review-gates.md:41-43]

The first four codes map onto signals described in [[Provenance Metadata]] and [[Claim-Level Citations]], which is why a project that tightens its citation rules usually sees its review queue grow before it sees its error count fall.

## Sources

review-gates.md
