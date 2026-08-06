---
title: Spiked Arena Deal
stage: killed
---

# Spiked Arena Deal

**This page is a deliberate fixture.** It raises two `field-violation` problems
at once against the `articles` type:

1. the required `headline` field is missing from its frontmatter;
2. `stage: killed` is not one of the declared values `draft`, `edited`,
   `published`.

Unlike an identity problem, a field violation still *produces* an entity page —
the page is readable and its identity is sound — but it is excluded from the
valid `articles` count, so the count and the problem list never disagree.

`killed` is a real newsroom state. It is simply not one this profile declares,
which is the ordinary way a profile and a newsroom drift apart: the desk invents
a state, the schema has not been updated to match, and the tooling says so out
loud instead of accepting a fourth stage nobody declared. The same value also
raises an `invalid-lifecycle-state` lint warning, because it is off the state
machine as well as off the enum.
