# Newsroom Wiki

A profile-driven project. `.llmwiki/profile.json` holds the `newsroom` profile,
which declares the three typed page directories below alongside `concepts/`.

## Typed entity pages

Directories declared by the profile. Each page's frontmatter is validated
against its entity type's field contract on every read.

### Articles — `articles/`

- [[Transit Levy Audit]] — published
- [[School Meals Contract]] — published
- [[Harbour Lease Records]] — edited
- [[Night Bus Cuts]] — draft
- [[Dock Strike Ballot]] — draft, written live by a seeded workflow run
- [[Library Closures List]] — draft, written live by a seeded workflow run

### Desks — `desks/`

- [[Metro]] — active
- [[Investigations]] — active
- [[Standards]] — archived

### Bylines — `bylines/`

- [[Jamie Rivera]] — confirmed
- [[Priya Okafor]] — confirmed
- [[Theo Lindqvist]] — pending

### Deliberately malformed pages

Three fixture pages do not satisfy the profile, so `problems` and `problemTotal`
are never empty here. Each one says so in its own body.

- `articles/Ferry Terminal Overruns.md` — `non-slug-safe-filename`
- `articles/spiked-arena-deal.md` — two `field-violation`s
- `bylines/sam-oyelaran.md` — `slug-mismatch`

None of them are linked above: a page with an identity problem is not produced
as an entity page at all, so linking it would be linking at nothing.

## Concepts

Ordinary compiled pages, in the default `concepts/` directory, explaining the
machinery the rest of this project exercises.

- [[Configurable Lifecycle Profiles]]
- [[Typed Entity Pages]]
- [[Typed Relations]]
- [[Lifecycle State Machines]]
- [[Workflow Gates]]
- [[Stage Outputs]]
- [[Profile Problems]]

## Sources

- `newsroom-profile.md`
- `desk-filing-process.md`
