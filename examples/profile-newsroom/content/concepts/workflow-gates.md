---
title: Workflow Gates
summary: An approval recorded against a run, deliberately separate from any page field, so editing frontmatter can never advance a workflow
sources:
  - desk-filing-process.md
  - newsroom-profile.md
kind: concept
createdAt: "2026-07-27T15:48:09.512Z"
updatedAt: "2026-07-27T15:48:09.512Z"
confidence: 0.91
provenanceState: extracted
---

# Workflow Gates

A **gate** is an approval that must be recorded against a run before a stage can
complete. The story pipeline's second stage, `file-under-desk`, carries the gate
`agent:edited`. ^[newsroom-profile.md:68-70]

The gate is not a synonym for the article's `edited` stage. It is a separate
approval recorded against the run itself. ^[desk-filing-process.md:53-55]

Keeping the two apart is the whole point. The article's field says what the
story *is*; the gate says that a specific run was *allowed to proceed*.
Collapsing them would mean that editing a page's frontmatter silently advanced a
workflow — precisely the implicit authority the gate exists to prevent.
^[desk-filing-process.md:57-60]

A gate id carries a kind prefix. `agent:` and `human:` gates are cleared by an
explicit approval; a `human:` gate additionally requires an interactive
confirmation rather than a self-asserted flag, so a script cannot claim to be a
person. A `trust:` gate is different again — it is cleared by a successful
trusted write, not by an approval, so approving it directly is not offered.

Because `file-under-desk` declares both a gate and writes, it has two
independent requirements and stays parked until both are met, in either order.
^[newsroom-profile.md:70-73] That produces two distinguishable parked runs: one
that has filed but is waiting for a decision, and one that has been approved but
is waiting for work. The difference tells you whether to go find an editor or a
reporter. ^[desk-filing-process.md:62-66]

See [[Stage Outputs]] for the other half of that pair, and
[[Lifecycle State Machines]] for the page-level states a gate is deliberately
not tied to. [[Configurable Lifecycle Profiles]] is where both are declared.
