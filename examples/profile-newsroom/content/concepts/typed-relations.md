---
title: Typed Relations
summary: Edges between typed pages, stored outside the pages in an append-only graph so a filing can be superseded without rewriting the story
sources:
  - newsroom-profile.md
  - desk-filing-process.md
kind: concept
createdAt: "2026-07-25T11:33:02.874Z"
updatedAt: "2026-07-25T11:33:02.874Z"
confidence: 0.88
provenanceState: extracted
---

# Typed Relations

A **typed relation** is an edge whose type, endpoint types, and direction are
declared by the profile. The newsroom profile declares exactly one:
`filed-under`, directed from an `articles` page to a `desks` page. Directed
means the direction carries meaning and is preserved as written — an article is
filed under a desk, and never the reverse. ^[newsroom-profile.md:44-47]

Relations are stored outside the pages, in an append-only graph store, rather
than as a frontmatter field. That is what makes an edge queryable from both ends
without reading every article, and what lets a filing be superseded without
touching the story text. ^[newsroom-profile.md:49-52]

The editorial reason is stronger than the technical one. The desk a story is
filed under is the desk that answers for it — legal questions, corrections and
follow-ups all route there — so a story with no filing has no owner.
^[desk-filing-process.md:26-29] Keeping the filing out of the page means a desk
does not have to be rewritten every time it takes on a story, and a story can be
reassigned without an edit. ^[desk-filing-process.md:31-34]

An endpoint that does not resolve to a valid page of the declared type is a
*dangling* relation. The store keeps the record and reports the dangle rather
than dropping the edge, because a filing that points at nothing is a fact about
the project somebody should see. ^[newsroom-profile.md:54-57] A page excluded by
a [[Profile Problems|profile problem]] is not a valid endpoint, so a malformed
page can turn a previously sound filing into a reported dangle.

See [[Typed Entity Pages]] for what the endpoints are, and [[Stage Outputs]] for
the path by which the story pipeline creates a filing.
