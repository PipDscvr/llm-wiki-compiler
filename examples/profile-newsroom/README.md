# Profile Example — Newsroom

A project running a **Configurable Lifecycle Profile**: typed entity pages,
typed relations, lifecycle state machines, a workflow with a gate, and live
workflow runs parked in the states a UI has to act on.

`examples/basic/` and `examples/showcase/` are both DEFAULT-profile projects —
untyped `concepts/` and `queries/` pages, no relation store, no workflows. This
one is the opposite end: it installs a real profile and exercises what that
profile makes possible, including the ways it can go wrong.

## What's here

```
sources/                          ← 2 ingested source documents
  newsroom-profile.md
  desk-filing-process.md

content/                          ← the committed copy of the wiki (see below)
  index.md
  concepts/                       ← 7 interlinked concept pages
  articles/                       ← 6 typed article pages (2 malformed on purpose)
  desks/                          ← 3 typed desk pages
  bylines/                        ← 4 typed byline pages (1 malformed on purpose)

seed.mjs                          ← generates .llmwiki/ and wiki/ (see below)
seed-data.mjs                     ← the filings, the run plans, the state map
seed-runs.mjs                     ← drives each run plan through the real ops
seed-content.mjs                  ← materializes content/ into wiki/
ts-loader.mjs                     ← lets seed.mjs import llmwiki's sources
```

## Run it

```bash
# once, from the repo root
npm run build

# generate .llmwiki/ and wiki/ (no API key, no network, safe to re-run)
node examples/profile-newsroom/seed.mjs

# then browse it
cd examples/profile-newsroom
llmwiki view --open
```

These all work in that directory and none of them need a model:

```bash
llmwiki status                 # profile id + typed page count + problem count
llmwiki status --json          # the full profile block: entityCounts, relationCounts,
                               # lifecycleStates, problems, problemTotal
llmwiki profile show           # the active profile's id, digest, and source file
llmwiki profile validate       # validate the profile itself
llmwiki template inspect newsroom
llmwiki workflow list          # the declared workflows and their stages
llmwiki workflow show story-pipeline
llmwiki workflow status        # every seeded run and what it is waiting for
llmwiki lint                   # profile-aware findings (see below)
```

## Which profile

The **`newsroom`** builtin template, installed by the seed through the real
`llmwiki template init newsroom`. Nothing here invents a type name: every id
below comes from `src/profile/templates/builtin/newsroom.ts`.

### Entity types

| Type | Directory | Required fields | Lifecycle field | States |
| --- | --- | --- | --- | --- |
| `articles` | `wiki/articles` | `headline`, `stage` | `stage` | `draft` → `edited` → `published` |
| `desks` | `wiki/desks` | `name`, `stage` | `stage` | `active` → `archived` |
| `bylines` | `wiki/bylines` | `reporter`, `stage` | `stage` | `pending` → `confirmed` |

### Relation type

| Type | From | To | Direction |
| --- | --- | --- | --- |
| `filed-under` | `articles` | `desks` | `directed` |

### Workflow

`story-pipeline`, two stages:

| Stage | reads | writes | gate |
| --- | --- | --- | --- |
| `draft-article` | `articles` | `articles` | — |
| `file-under-desk` | `articles`, `desks` | `articles`, `desks` | `agent:edited` |

Plus one declared workflow action, `story.file` (`trustGate: trust:desk`), which
`llmwiki workflow action list` shows.

## What it demonstrates that the other examples cannot

### 1. A non-default profile is actually active

`llmwiki status` gains a profile line, and `status --json` gains the whole
`profile` block that `src/profile/block.ts` builds. Every field below is real,
not stubbed:

```json
{
  "profileId": "newsroom",
  "digest": "866882812c21c769e469d3f842b5bbdcc1d14cab4195cdb701d4c4181e4000ae",
  "entityCounts": { "articles": 6, "desks": 3, "bylines": 3 },
  "problemTotal": 4,
  "relationCounts": { "filed-under": 6 },
  "relationTotal": 6,
  "eventCount": 6,
  "lifecycleStates": {
    "articles": { "draft": 4, "edited": 1, "published": 2, "killed": 1 },
    "desks": { "active": 2, "archived": 1 },
    "bylines": { "confirmed": 3, "pending": 1 }
  }
}
```

`entityCounts` counts only VALID pages, which is why `articles` reads 6 out of 8
files on disk. `lifecycleStates` is a raw tally of the field's value, which is
why `killed` appears there even though it is not a declared state — the count
surface reports what is written, and the problem surface says why it is wrong.

Where each field surfaces, if you are building against it:

| Field | `status --json` | `/api/pages` | `/api/health` |
| --- | --- | --- | --- |
| `profileId`, `digest` | `profile.profileId` / `.digest` | `profileId` (flattened; `"default"` when there is no profile) | — |
| `problems` / `problemTotal` | `profile.problems` / `.problemTotal` | `profileProblems` / `profileProblemTotal` (both OMITTED when clean) | as `profile/<kind>` rows under `lint.rules` |
| `entityCounts`, `relationCounts`, `relationTotal`, `eventCount`, `lifecycleStates` | yes | — | — |

Absence is the signal on every one of these: a default-profile project's
envelope is byte-identical to what it was before profiles existed, so a client
can treat a missing key as "nothing to show" without a second flag.

### 2. Typed relations, so the graph has real edges

Six `filed-under` relations in `wiki/graph/relations.jsonl`, each with a
matching `relation-create` entry in the hash-chained `wiki/graph/events.jsonl`.
Four are the back catalogue, appended by the seed through `appendRelation`; two
are created by the seeded workflow runs through `workflow submit --kind
relation`.

`/api/graph` returns them as typed edges alongside the concept-page wikilink
edges:

```json
{ "source": "articles/transit-levy-audit", "target": "desks/investigations",
  "edgeKind": "relation", "relationType": "filed-under", "direction": "directed" }
```

### 3. Five workflow runs, including both actionable parked states

`/api/workflow-runs` (and `llmwiki workflow status`) after seeding:

| Run | classification | status | currentStage | parked on |
| --- | --- | --- | --- | --- |
| `story-pipeline-ferry-inquiry` | `current` | `running` | `draft-article` | `awaitingOutput: true` |
| `story-pipeline-dock-strike` | `current` | `running` | `file-under-desk` | `awaitingGate: "edited"` |
| `story-pipeline-night-bus` | `current` | `pending` | `draft-article` | — |
| `story-pipeline-library-closures` | `historical` | `completed` | `null` | — |
| `story-pipeline-arena-deal` | `historical` | `cancelled` | `null` | — |

The gate-parked run is the fiddly one and the reason its plan in `seed-data.mjs`
has six steps. `file-under-desk` declares BOTH a gate and writes, so a run that
reaches it without submitting its filing reports `awaitingGate` **and**
`awaitingOutput` at once. Submitting the filing first leaves the gate as the
only outstanding requirement, which is what makes it a clean `awaitingGate` row.

Both parked runs are genuinely actionable — the seed leaves them owned by
whoever ran it, so you can push them forward by hand:

```bash
llmwiki workflow gate approve story-pipeline-dock-strike edited
llmwiki workflow advance story-pipeline-dock-strike     # → completed

llmwiki workflow submit story-pipeline-ferry-inquiry \
  --kind page --entity-type articles --slug ferry-terminal-inquiry \
  --body-file some-article.md
```

### 4. Deliberate profile problems, so `problems[]` is never empty

Three fixture pages fail the profile in three different ways. Each says so in
its own body, so nobody mistakes them for a bug:

| Page | Kind | Lint severity | What triggers it |
| --- | --- | --- | --- |
| `wiki/articles/Ferry Terminal Overruns.md` | `non-slug-safe-filename` | error | The filename stem is not `[a-z0-9][a-z0-9-]*` |
| `wiki/articles/spiked-arena-deal.md` | `field-violation` ×2 | warning | Required `headline` missing; `stage: killed` is off the declared enum |
| `wiki/bylines/sam-oyelaran.md` | `slug-mismatch` | error | Frontmatter `slug: samuel-oyelaran` ≠ file stem `sam-oyelaran` |

That is `problemTotal: 4` over three pages and two entity types — deliberately
more problems than pages, because one page raising two problems is a case any UI
grouping by path has to handle.

The fourth kind, `invalid-directory`, needs a symlinked or confinement-failing
entity directory and so cannot be committed. It is the one that must never be
mistaken for "this entity type has no pages"; it is the only kind with no `path`
field.

**What a problem does downstream.** A page with an IDENTITY problem
(`non-slug-safe-filename`, `slug-mismatch`) is not produced as an entity page at
all: it is missing from `entityCounts`, cannot be a relation endpoint, and is
not a graph node. A page with only a `field-violation` IS produced — it is
readable and its identity is sound — but it is still excluded from the valid
count, so the count and the problem list can never disagree. Nothing is
auto-renamed and nothing is auto-corrected; the page stays exactly where it is.

### 5. Profile-aware lint

`llmwiki lint` here reports the profile rules, not the default content rules:

```
x error   wiki/articles/Ferry Terminal Overruns.md  Entity page has a non-slug-safe filename;
                                                    rename it to "ferry-terminal-overruns" …
! warning wiki/articles/spiked-arena-deal.md        Required field "headline" is missing from frontmatter.
! warning wiki/articles/spiked-arena-deal.md        Field "stage" value "killed" is not one of
                                                    ["draft","edited","published"].
x error   wiki/bylines/sam-oyelaran.md              Declared slug "samuel-oyelaran" does not match
                                                    file stem "sam-oyelaran".
! warning wiki/articles/spiked-arena-deal.md        lifecycle field "stage" value "killed" is not a
                                                    declared state

* 2 error(s), 3 warning(s), 0 info
```

Every problem becomes a `profile/<kind>` lint rule, plus one
`invalid-lifecycle-state` finding — the same bad value seen twice, once as a
field-contract breach and once as an off-FSM lifecycle value. `lint` exits 1
because there are errors; that is expected here, and the seed treats exit 1 as
success when it writes `.llmwiki/last-lint.json`.

The default content rules still run over `concepts/`, and the concept pages are
clean, so nothing in that output is noise.

## Why the wiki is generated rather than committed

Two separate reasons, and both are about staying honest rather than about
convenience.

**`.llmwiki/` is ignored repo-wide** (`.gitignore:4`), so the example cannot
ship its profile, its template lock, its workflow runs, or its lint cache as
tracked files.

**`llmwiki template init` refuses to install a profile over a non-empty typed
corpus.** That is the correct rule — reinterpreting existing pages under a
schema they were never written against is a migration, not an install — but it
means a profile project is installed EMPTY and populated afterwards. If this
example committed its pages at `wiki/articles/…`, the very first
`template init` on a fresh clone would refuse, and the only way around it would
be to write `.llmwiki/profile.json` behind the CLI's back.

So the committed copy of the wiki lives in `content/`, and `seed.mjs`
materializes it into `wiki/` after the install. `content/` is what to read on
GitHub; `wiki/` is what the tools read.

Two article pages have no counterpart in `content/` at all —
`wiki/articles/dock-strike-ballot.md` and
`wiki/articles/library-closures-list.md`. Those are written LIVE by the seeded
workflow runs, and they must not be committed: the typed page write path is
create-only, so an existing target is a collision and the write is parked for
review instead of applied. A committed copy would leave the gate-parked run
stuck at `draft-article` forever.

## What the seed writes, and who writes it

`seed.mjs` never hand-rolls a machine-owned format. A workflow run record in
particular carries an integrity HMAC over its own bytes, so a hand-written run
file would not merely be brittle — it would be unreadable.

| Artifact | Written by |
| --- | --- |
| `.llmwiki/profile.json`, `.llmwiki/template-lock.json` | a real `llmwiki template init newsroom` |
| `wiki/**` (pages) | a plain copy of the committed `content/**` |
| `.llmwiki/state.json` | `writeState` from `src/utils/state.ts` |
| `wiki/graph/relations.jsonl` + `events.jsonl` | `appendRelation` from `src/relations/store.ts`, and the workflow submit path |
| `.llmwiki/workflows/runs/*.json` | `startWorkflow` / `advanceWorkflow` / `submitStageOutput` / `approveGate` / `cancelWorkflow` |
| `.llmwiki/last-lint.json` | a real `llmwiki lint` run |

`ts-loader.mjs` is what makes that possible: a Node resolve hook that retries a
`./x.js` specifier as `./x.ts`, so the seed can import llmwiki's own sources
with no build step. The script also re-execs itself once with
`--experimental-transform-types`, because Node strips TypeScript types but does
not transform them and llmwiki's sources use constructor parameter properties.

**Offline.** No API key, no network, no model. The profile is a builtin
template, the pages are committed, the filings and run plans are written down,
and lint is a pure static pass.

**Idempotent.** Re-running the seed is safe:

- the profile install is skipped when `newsroom` is already active;
- the `content/` → `wiki/` copy overwrites with identical bytes and deletes
  nothing, so the run-written pages survive;
- `appendRelation` dedups on content hash, so no second record and no second
  audit event;
- every run is pinned to a fixed id and skipped WHOLE when that id already
  exists — deliberately, so a gate you approved by hand is not reverted;
- `state.json` and `last-lint.json` are single overwritten files.

Every write lands inside this directory, every path is derived from the
script's own location rather than the working directory, and the script refuses
to start if the layout above or the repo root does not look right.

To start over completely:

```bash
rm -rf examples/profile-newsroom/.llmwiki examples/profile-newsroom/wiki
node examples/profile-newsroom/seed.mjs
```

The seed also clears `wiki/` for you whenever it has to install the profile,
since `template init` needs an empty typed corpus — including an empty
`wiki/graph/`.

## Reproduce the content itself

The `sources/` and `content/` trees are hand-authored to exercise specific code
paths — they are not raw LLM output, and compiling them would produce different
(and much cleaner) pages. For real generated output from a real model, use
`examples/basic/`.
