# The Newsroom Profile

A design note for the `newsroom` lifecycle profile, written for editors who have
to live with it rather than for the people who implemented it.

## What a profile is

A profile is the schema a project's knowledge is held to. It declares which
kinds of page exist, which directory each kind lives in, which frontmatter
fields each kind must carry, and which values those fields are allowed to take.
Everything downstream — validation, the graph, the workflow engine, lint, the
viewer — reads that one declaration rather than hard-coding a shape.

The default profile declares two untyped page directories and nothing else. It
is deliberately shapeless: a project that has not decided what it is modelling
should not be forced to. A profile is the moment a project decides.

## The three entity types

The newsroom profile declares three entity types. Each one names the directory
its pages live in, the fields those pages must carry, and the lifecycle those
pages move through.

`articles` live in `wiki/articles`. Every article page carries a `headline`
string and a `stage` that is one of `draft`, `edited`, or `published`. An
article starts at `draft`, may move to `edited`, and from there to `published`.
`published` is terminal — there is no transition out of it, because a published
story is a matter of record and correcting one is a different act from editing
an unpublished draft.

`desks` live in `wiki/desks`. A desk page carries a `name` and a `stage` that is
either `active` or `archived`. A desk starts `active` and can be `archived`
once; `archived` is terminal. Archiving a desk does not delete the stories filed
under it, which is the whole reason desks are pages rather than a string field
on an article.

`bylines` live in `wiki/bylines`. A byline page carries a `reporter` name and a
`stage` of either `pending` or `confirmed`. A byline starts `pending` — a name
attached to a draft is a claim, not a fact — and becomes `confirmed` when the
desk has verified who actually did the work.

## The filing relation

One relation type is declared: `filed-under`, directed from an `articles` page
to a `desks` page. Directed means the direction carries meaning and is preserved
as written: an article is filed under a desk, and a desk is never filed under an
article.

The relation is stored outside the pages, in an append-only graph store, rather
than as a frontmatter field. That is what makes it queryable in both directions
without reading every article, and what lets a filing be superseded without
rewriting the story it concerns.

An endpoint that does not resolve to a valid page of the declared type is a
dangling relation. The store keeps the record and reports the dangle; it does
not quietly drop the edge, because a filing that points at nothing is a fact
about the project that somebody should see.

## The story pipeline

One workflow is declared: `story-pipeline`, with two stages.

The first stage, `draft-article`, reads and writes `articles`. It has no gate.
It does not advance on its own: a stage that declares writes advances only when
a typed output has actually been submitted for it, so a run sitting on
`draft-article` is waiting for somebody to produce the article page.

The second stage, `file-under-desk`, reads and writes both `articles` and
`desks`, and carries the gate `agent:edited`. A gate is an approval that must be
recorded before the stage can complete. Because this stage also declares writes,
it has two independent requirements — the filing has to be submitted and the
gate has to be approved — and it stays parked until both are met. The order does
not matter.

## What the profile deliberately does not do

The profile declares no artifacts, no content tiers, no relation preconditions,
and no connector bindings. Those exist in the runtime and other profiles use
them. Leaving them out here is the point: a profile is a subset of the runtime's
vocabulary chosen for one domain, not a mandatory checklist, and the same
generic machinery has to behave correctly when a profile uses only part of it.
