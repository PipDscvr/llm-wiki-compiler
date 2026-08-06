---
title: Page Freshness
summary: The four-state classification — fresh, stale, orphaned, unverified — derived on demand from recorded source digests rather than persisted
sources:
  - incremental-builds.md
kind: concept
createdAt: "2026-07-14T09:22:23.219Z"
updatedAt: "2026-07-30T13:55:41.451Z"
tags:
  - incremental
  - health
aliases:
  - page-freshness
  - PF
confidence: 0.88
provenanceState: derived
modelId: claude-sonnet-4-6
promptVersion: v1
---

# Page Freshness

**Page freshness** answers one question about a compiled page: do the sources it was built from still say what they said at compile time? It is computed on demand from the recorded digests, never stored, so it cannot itself go stale. ^[incremental-builds.md:31-33]

## The four states

- **Fresh** — every owning source is present and unchanged. ^[incremental-builds.md:42]
- **Stale** — an owning source changed, or one of several owners disappeared. ^[incremental-builds.md:43]
- **Orphaned** — every source that owned the page has been deleted. ^[incremental-builds.md:44]
- **Unverified** — no source claims the page, or the state file cannot be read. ^[incremental-builds.md:45]

## Unverified is not a failure

Hand-authored pages and saved query answers are legitimately unowned, and reporting them as stale would train readers to ignore the signal entirely. ^[incremental-builds.md:47-49]

The same reasoning applies when the state file is missing or unreadable: freshness is reported as unverified rather than assumed good, because "we cannot tell" and "nothing is wrong" are different facts. ^[incremental-builds.md:35-38]

## Where it surfaces

Stale and orphaned pages become lint warnings, and the viewer's health screen draws one bar per concept page coloured by its state. [[Change Detection]] supplies the digests the whole computation rests on.

## Sources

incremental-builds.md
