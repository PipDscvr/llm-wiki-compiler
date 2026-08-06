---
title: Lifecycle State Machines
summary: A declared field, a declared initial state, and a declared transition table — so an illegal move is refused rather than argued about
sources:
  - desk-filing-process.md
  - newsroom-profile.md
kind: concept
createdAt: "2026-07-26T08:21:37.640Z"
updatedAt: "2026-07-28T16:05:12.400Z"
confidence: 0.95
provenanceState: extracted
---

# Lifecycle State Machines

A **lifecycle** turns one frontmatter field into a state machine. The profile
names the field, the initial state, the terminal states, and the legal
transitions out of each state.

A story's stage is therefore not a label somebody sets; it is a position.
`draft` means nobody but the reporter has taken responsibility for the text,
`edited` means a desk editor stands behind it, and `published` means the record
is now correctable but no longer editable. ^[desk-filing-process.md:8-12]

Because the transitions are declared, illegal moves are refused rather than
argued about. There is no declared transition from `draft` to `published`, so
the only route to publication runs through an editor — enforced by the tooling
rather than by discipline. ^[desk-filing-process.md:14-17]

Terminal states carry as much information as transitions. `published` is
terminal, so an audit can distinguish "this piece is finished" from "this piece
has stalled": a stage with a route out is work in progress, and a stage with no
route out is a decision. ^[desk-filing-process.md:19-22]

All three newsroom types declare a lifecycle on the same field name. Articles
run `draft → edited → published` ^[newsroom-profile.md:24-26]; desks run
`active → archived`, and archiving a desk deliberately does not disturb the
stories filed under it ^[newsroom-profile.md:31-35]; bylines run
`pending → confirmed`, because attribution is a claim until somebody checks it
^[desk-filing-process.md:41-44] and stays a matter of record afterwards
^[desk-filing-process.md:46-49].

A value that is not a declared state is not silently accepted as a fourth stage
— it is a [[Profile Problems|profile problem]] on that page. See
[[Typed Entity Pages]] for the field contract these states sit inside, and
[[Workflow Gates]] for why a lifecycle value is not the same thing as an
approval.
