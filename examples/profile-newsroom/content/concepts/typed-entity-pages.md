---
title: Typed Entity Pages
summary: Markdown pages whose directory, required fields, and allowed field values are fixed by the active profile rather than by convention
sources:
  - newsroom-profile.md
kind: concept
createdAt: "2026-07-24T10:40:18.220Z"
updatedAt: "2026-07-25T14:02:51.109Z"
confidence: 0.9
provenanceState: extracted
---

# Typed Entity Pages

A **typed entity page** is an ordinary markdown file that a profile has claimed.
Each declared entity type names the directory its pages live in, the fields
those pages must carry, and the lifecycle those pages move through.
^[newsroom-profile.md:20-22] The newsroom profile declares three of them:

| Type | Directory | Required fields | Stage values |
| --- | --- | --- | --- |
| `articles` | `wiki/articles` | `headline`, `stage` | `draft`, `edited`, `published` |
| `desks` | `wiki/desks` | `name`, `stage` | `active`, `archived` |
| `bylines` | `wiki/bylines` | `reporter`, `stage` | `pending`, `confirmed` |

An article carries a `headline` string and a `stage` drawn from a closed set.
^[newsroom-profile.md:24-26] A desk carries a `name` and is either `active` or
`archived`; desks are pages rather than a string field on an article precisely
so that archiving one does not disturb the stories filed under it.
^[newsroom-profile.md:31-35] A byline carries a `reporter` name and starts
`pending`, because a name attached to a draft is a claim rather than a fact.
^[newsroom-profile.md:37-40]

The filename stem is the page's identity — not a slugified version of the title,
and not a frontmatter field that could disagree with it. That is what makes
[[Typed Relations]] able to name an endpoint as `articles/night-bus-cuts` and
have it mean exactly one file. When the stem and the declared slug do disagree,
the result is a [[Profile Problems|profile problem]] rather than a guess.

The field contract is checked on read as well as on write, so a page hand-edited
in an editor is held to the same rules as one produced by
[[Stage Outputs|a workflow stage output]]. See also
[[Lifecycle State Machines]].
