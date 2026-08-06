# Desk Filing Process

The house rules for moving a story from a reporter's draft to a filed,
published piece — and the reasons each rule exists.

## Stages, not statuses

A story's stage is not a label somebody sets; it is a position in a state
machine. `draft` means nobody but the reporter has taken responsibility for the
text. `edited` means a desk editor has read it end to end and stands behind it.
`published` means it is public and the record is now correctable but not
editable.

Because the transitions are declared, illegal moves are refused rather than
argued about. A draft cannot jump straight to published: there is no declared
transition from `draft` to `published`, so the only way to publish is to go
through an editor. That rule is enforced by the tooling, not by discipline.

Terminal states matter as much as transitions. `published` is terminal, so an
audit can tell the difference between "this piece is finished" and "this piece
has stalled". A stage with a route out is work in progress; a stage with no
route out is a decision.

## Every story is filed under exactly one desk

Filing is not categorisation. The desk that a story is filed under is the desk
that answers for it: legal questions, corrections, and follow-ups all route
there. A story with no filing has no owner, which is why the pipeline will not
complete a run until the filing exists.

Filings are recorded as relations rather than as a field on the story, so the
desk's own page does not have to be rewritten every time it takes on a story,
and so a filing can be superseded — reassigned to a different desk — without
touching the story text at all.

An archived desk keeps its filings. Archiving means the desk has stopped taking
new work, not that its back catalogue evaporated.

## Bylines are verified separately

A byline page starts `pending` because attribution is a claim until somebody
checks it. Freelance contributions, wire copy, and stories where a stringer did
the reporting and a staffer did the writing are exactly the cases that get this
wrong, and they are common enough that the default has to be "not yet verified".

A byline moves to `confirmed` when the desk has established who did the work.
`confirmed` is terminal. Attribution that turns out to be wrong after
confirmation is handled as a correction on the record, not as a quiet edit of
the byline page.

## The gate on filing

The second stage of the pipeline carries an `agent:edited` gate. The gate is not
a synonym for the article's `edited` stage — it is a separate approval that has
to be recorded against the run before the stage can complete.

Keeping them separate is deliberate. The article field says what the story is;
the gate says that a specific run was allowed to proceed. Collapsing the two
would mean that editing the frontmatter of a page silently advanced a workflow,
which is exactly the kind of implicit authority the gate exists to prevent.

A run that has submitted its filing but has not had the gate approved is parked
waiting for a decision. A run that has had the gate approved but has not
submitted its filing is parked waiting for work. Both are visible, and the
difference between them tells you whether to go find an editor or go find a
reporter.

## Malformed pages are reported, never hidden

Pages that do not satisfy the profile are not silently dropped from the wiki and
they are not silently counted as healthy either. A page whose filename is not a
valid slug, a page whose declared slug disagrees with its filename, and a page
carrying a field value the profile does not declare are each reported as a
problem against the entity type they claim to belong to.

The page stays on disk. Nothing is auto-renamed and nothing is auto-corrected,
because both of those are editorial decisions. What the tooling guarantees is
that the project can never report itself as clean while one of them is sitting
there.
