---
title: Profile Problems
summary: The structured record of every page that claims an entity type but does not satisfy it — so a project with a bad page is never reported as silently healthy
sources:
  - desk-filing-process.md
kind: concept
createdAt: "2026-07-31T12:19:03.660Z"
updatedAt: "2026-08-02T07:55:40.118Z"
confidence: 0.94
provenanceState: extracted
---

# Profile Problems

A page that does not satisfy the profile is neither dropped from the wiki nor
counted as healthy. It is reported as a **problem** against the entity type it
claims to belong to. ^[desk-filing-process.md:70-74] Four kinds exist, and each
names the offending path and entity type:

| Kind | Severity in lint | What triggers it |
| --- | --- | --- |
| `non-slug-safe-filename` | error | A filename stem outside `[a-z0-9][a-z0-9-]*` — spaces, capitals, underscores |
| `slug-mismatch` | error | A frontmatter `slug` that disagrees with the filename stem |
| `field-violation` | warning | A missing required field, or a value outside its declared type / enum / range |
| `invalid-directory` | error | An entity directory that is a symlink or fails confinement, so it was not read |

The first three are page-level and carry the page's project-relative path — a
bad filename, a declared slug that disagrees with it, and a field value the
profile does not declare are exactly the three the desk rules name.
^[desk-filing-process.md:71-74] The fourth is directory-level and carries no
path, because the whole directory went unread — which is the case that must
never be mistaken for "this entity type has no pages".

A page with an identity problem is not produced as an entity page at all, so it
does not appear in the per-type counts, cannot be a
[[Typed Relations|relation endpoint]], and is not a graph node. A page with only
a field violation *is* produced, but is still excluded from the valid count, so
the count and the problem list never contradict each other. One page can raise
several problems at once — a missing required field and an off-enum value are
two separate records.

Nothing is auto-renamed and nothing is auto-corrected: both are editorial
decisions, and the page stays on disk. What the tooling guarantees is that the
project cannot report itself as clean while one of them is sitting there.
^[desk-filing-process.md:76-79]

See [[Typed Entity Pages]] for the contract being violated and
[[Configurable Lifecycle Profiles]] for where it is declared.
