---
title: How do I tell if a page has gone stale?
summary: Compare each owning source's current digest against the digest recorded at compile time — the wiki reports fresh, stale, orphaned, or unverified.
kind: query
sources:
  - incremental-builds.md
createdAt: "2026-08-01T07:30:12.889Z"
updatedAt: "2026-08-01T07:30:12.889Z"
---

# How do I tell if a page has gone stale?

Ask the state file, not the page.

Freshness is computed from the recorded digests rather than stored, so it cannot itself go stale. A page is fresh when every source that owns it is present and unchanged; stale when an owner changed or one of several owners disappeared; orphaned when every owner is gone. See [[Page Freshness]]. ^[incremental-builds.md:42-44]

A fourth state exists for pages nothing owns. Hand-authored pages and saved answers — including this one — are legitimately unowned, and reporting them as stale would train readers to ignore the signal entirely. ^[incremental-builds.md:45-49]

In practice you read it off the health screen, where each concept page gets one bar coloured by its state, or from `llmwiki lint`, which reports stale and orphaned pages as warnings. [[Change Detection]] supplies the digests underneath both. ^[incremental-builds.md:31-33]

## Sources

incremental-builds.md
