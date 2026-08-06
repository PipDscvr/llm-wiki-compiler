---
title: provenance and citations
source: examples/showcase/sources/provenance-and-citations.md
ingestedAt: "2026-07-14T09:14:02.000Z"
---

# Provenance and Citations

A generated page is only as useful as the reader's ability to check it. The
citation format exists so that checking takes one click rather than one
afternoon.

## The marker grammar

Citations are written as caret-bracket markers appended to the paragraph they
support. Four forms are recognised:

- `^[file.md]` — a paragraph-level citation naming a whole source.
- `^[file.md:42-58]` — a claim-level citation naming a line span.
- `^[file.md:1, 4-6]` — several disjoint spans in one source.
- `^[file.md#L42-L58]` — the same span in GitHub's anchor syntax.

Anything else that contains a colon or a hash is malformed, and the linter says
so rather than quietly dropping the marker. A dropped marker is worse than a
loud one: it turns an unverifiable claim into a claim that merely looks clean.

## Spans are the unit of trust

A paragraph-level citation tells you which document to go read. A span tells
you which sentences to go read. The difference matters most on long sources,
where "it's in the 90-page handbook somewhere" is not meaningfully different
from no citation at all.

Spans are validated against the source file's real length at lint time. A span
that runs off the end of its file is reported as broken, because a citation
that points past the last line cannot have been checked by whoever wrote it.

## Resolution

A citation resolves when the file it names still exists under `sources/`. When
a source is deleted, every citation that named it stops resolving, and the
viewer's traceability meter drops below 100% until the pages that depended on
it are recompiled or retired.

This is deliberate. The alternative — pruning the citation along with the
source — would leave a confident, uncited paragraph behind and no record that
its evidence ever existed.

## Confidence and contradiction

Two further signals ride in page frontmatter. A `confidence` number records how
well supported the page was at generation time, and a low value is a lint
warning rather than a silent property. A `contradictedBy` list names other
pages whose evidence disagrees with this one, so a reader meets the conflict
instead of picking whichever page they happened to open first.

Neither field is authoritative on its own. They are prompts for a human to look
closer, which is why both surface as warnings rather than errors.
