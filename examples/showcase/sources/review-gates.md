---
title: review gates
source: examples/showcase/sources/review-gates.md
ingestedAt: "2026-07-14T09:17:11.000Z"
---

# Review Gates

Generated pages are proposals. A review gate is the mechanism that keeps a
proposal out of the wiki until a human has agreed to it.

## Candidates

When a page is held, it is written to the private candidate store as a JSON
record rather than to the wiki tree. The record carries the full rendered body,
so approving it later is a pure file copy — the model is never called a second
time, and the reviewer approves exactly the bytes they read.

Each candidate also carries the per-source state snapshot captured at
generation time. Approving the candidate writes that snapshot into the project
state, which is what stops an approved page from being regenerated on the very
next run.

## Why a page gets held

Holds are structured, not free-text, so the review queue can be sorted and
filtered. The policy codes are:

- `low-confidence` — the generation-time confidence fell below the threshold.
- `contradicted` — the page's frontmatter names pages that disagree with it.
- `schema-violating` — the body breaks a declared per-kind rule, most often the
  minimum cross-link count.
- `provenance-violating` — a citation is malformed, out of bounds, or names a
  file that is not in `sources/`.
- `all` — the project holds every generated page, regardless of signal.
- `manual-review-requested` — a human asked for this one specifically.
- `imported-okf` — the page arrived through a bundle import rather than a local
  compile.
- `connector-fetched` — the page was built from data pulled by a connector.

A candidate can carry several codes at once. The queue shows all of them,
because "held for two independent reasons" is a different situation from "held
because someone passed a flag".

## Links into the queue

A wikilink whose target is still sitting in the review queue is not broken —
it is early. The linter reports it as informational rather than as an error, so
that a reviewer working through a batch is not drowned in errors that will
resolve themselves the moment they approve the next candidate.

## Rejection is archival

Rejecting a candidate moves it into an archive directory instead of deleting
it. The proposal, its held reasons, and its citations stay auditable, which
matters when the question later becomes "did we ever consider this and decide
against it?"
