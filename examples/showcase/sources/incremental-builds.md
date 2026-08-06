---
title: incremental builds
source: examples/showcase/sources/incremental-builds.md
ingestedAt: "2026-07-14T09:15:37.000Z"
---

# Incremental Builds

Recompiling a whole corpus because one paragraph changed is expensive in a
build system and ruinous in a pipeline that bills per token. Incremental
compilation exists to make the cost of a change proportional to the size of
the change.

## Hashing as the change signal

Every source file is hashed with SHA-256 at the end of a successful run, and
the digest is recorded in the project state file alongside the list of concepts
that source produced. On the next run the compiler re-hashes each file and
compares.

Three outcomes matter. A file with no recorded hash is new. A file whose hash
differs from the record has changed. A file that is recorded but no longer on
disk has been deleted, and the pages it owned are now unsupported.

Timestamps were the obvious alternative and were rejected. Checkouts, syncs,
and format-on-save all move a modification time without changing a single byte,
which would make the pipeline re-bill the entire corpus after a fresh clone.

## Ownership, not authorship

The state file records which concepts each source produced. That map is what
makes a merged page's freshness computable: a page is fresh when every source
that owns it still exists and still hashes to its recorded digest.

The map is authoritative. Freshness is never inferred from the page body or
from frontmatter dates, because both are trivially wrong after a hand edit. If
the state file is missing or unreadable, freshness is reported as unverified
rather than assumed good.

## The four freshness states

- **Fresh** — every owning source is present and unchanged.
- **Stale** — an owning source changed, or one of several owners disappeared.
- **Orphaned** — every source that owned the page has been deleted.
- **Unverified** — no source claims the page, or the state file cannot be read.

Unverified is not a failure. Hand-authored pages and saved query answers are
legitimately unowned, and reporting them as stale would train readers to ignore
the signal entirely.

## Recovering from a partial run

State is written per source rather than once at the end, so an interrupted run
only reprocesses the sources it had not finished. A compile journal records
what was in flight, and an incomplete journal is surfaced as a lint warning so
a project never reads clean while partial state sits on disk.
