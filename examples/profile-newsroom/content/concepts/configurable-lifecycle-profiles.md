---
title: Configurable Lifecycle Profiles
summary: The single declaration that tells the whole runtime what kinds of thing a project contains and what may happen to them
sources:
  - newsroom-profile.md
kind: concept
createdAt: "2026-07-24T09:12:44.001Z"
updatedAt: "2026-07-24T09:12:44.001Z"
confidence: 0.93
provenanceState: extracted
---

# Configurable Lifecycle Profiles

A **profile** is the schema a project's knowledge is held to. It declares which
kinds of page exist, which directory each kind lives in, which frontmatter
fields each kind must carry, and which values those fields may take.
^[newsroom-profile.md:8-10]

Nothing downstream re-derives that shape. Validation, the graph, the workflow
engine, lint, and the viewer all read the one declaration instead of hard-coding
a layout, which is why a new profile does not require a new build of any of
them. ^[newsroom-profile.md:11-12]

The default profile declares two untyped page directories and nothing else. It
is deliberately shapeless — a project that has not decided what it is modelling
should not be forced to — so installing a profile is the moment a project
decides. ^[newsroom-profile.md:14-16]

A profile is a *subset* of the runtime's vocabulary, not a checklist. This one
declares no artifacts, no content tiers, no relation preconditions, and no
connector bindings, and the same generic machinery has to stay correct when only
part of the vocabulary is in use. ^[newsroom-profile.md:77-81]

What this profile does declare is covered by [[Typed Entity Pages]],
[[Typed Relations]], [[Lifecycle State Machines]], and [[Workflow Gates]]. What
happens when a page fails to satisfy it is covered by [[Profile Problems]].
