---
title: Stage Outputs
summary: The typed write a stage is waiting for — a page, a relation, or a lifecycle transition, scoped to exactly what the stage declared it writes
sources:
  - newsroom-profile.md
  - desk-filing-process.md
kind: concept
createdAt: "2026-07-29T13:07:55.318Z"
updatedAt: "2026-07-30T09:44:21.775Z"
confidence: 0.87
provenanceState: extracted
---

# Stage Outputs

A stage that declares writes does **not** advance on its own. It advances when a
typed output has actually been submitted for it, so a run sitting on
`draft-article` is waiting for somebody to produce the article page.
^[newsroom-profile.md:63-66]

The submitted output is scoped to what the stage declared. `draft-article`
declares `articles`, so it can produce an article page and nothing else;
`file-under-desk` declares both `articles` and `desks`, which is what lets it
create a `filed-under` [[Typed Relations|relation]] whose two endpoints are of
those types. ^[newsroom-profile.md:68-69] A submission naming a type outside the
current stage's declared writes is refused before anything is planned or
written.

Three output kinds cover the newsroom profile: a **page** (create a typed entity
page), a **relation** (create a typed edge), and a **lifecycle-transition**
(move an existing page to a new declared state — see
[[Lifecycle State Machines]]). Every one of them goes through the same trust
floor: path confinement, a collision check, a size cap, and a frontmatter parse.

The collision check is the one that surprises people. The page path is
create-only by default: submitting a page whose file already exists is not an
overwrite, it is a collision, and the write is parked for review instead of
applied. That is why a stage output can be a clean, well-formed page and still
not go live.

The pipeline will not complete a run until the filing exists, which is the same
rule stated editorially: a story with no filing has no owner.
^[desk-filing-process.md:26-29]

An output and a [[Workflow Gates|gate]] are independent requirements. A stage
carrying both stays parked until both are met, and reports which one it is still
waiting for. ^[newsroom-profile.md:70-73]
