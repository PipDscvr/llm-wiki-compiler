/**
 * @file examples/profile-newsroom/seed-data.mjs
 * @description Everything `seed.mjs` writes, expressed as data: the compile
 * record for `state.json`, the standing `filed-under` filings, and the five
 * workflow run plans.
 *
 * Kept separate from the orchestration so neither file grows past the project's
 * size budget, and so a reader who wants to know "what does this example claim
 * about itself" reads one file of data instead of skimming a driver loop.
 *
 * Every timestamp here is a FIXED literal rather than `new Date()`, and every
 * run id is a FIXED slug rather than a minted one, so seeding twice produces the
 * same bytes and the same run files — the example's idempotence guarantee starts
 * with its inputs being constant.
 *
 * WHY the run plans are data and not code: each plan is the exact sequence of
 * real lifecycle operations that lands a run in one observable state, so the
 * table below doubles as the answer to "how do I reproduce an `awaitingGate`
 * run" without reading the driver.
 */

/**
 * Which concept pages each source produced, for `.llmwiki/state.json`. Both
 * sources are present on disk and hash to their recorded digest, so every
 * concept page resolves to `fresh` — this example's interesting failure modes
 * are profile problems, not freshness, and mixing both would blur which surface
 * is reporting what. `examples/showcase/` is the fixture for freshness.
 */
export const SOURCE_CONCEPTS = {
  "newsroom-profile.md": [
    "configurable-lifecycle-profiles",
    "typed-entity-pages",
    "typed-relations",
    "lifecycle-state-machines",
    "workflow-gates",
    "stage-outputs",
  ],
  "desk-filing-process.md": [
    "lifecycle-state-machines",
    "typed-relations",
    "workflow-gates",
    "stage-outputs",
    "profile-problems",
  ],
};

/** Compile timestamps recorded per source, fixed so re-seeding is a no-op diff. */
export const COMPILED_AT = {
  "newsroom-profile.md": "2026-07-31T09:18:22.140Z",
  "desk-filing-process.md": "2026-08-01T11:04:57.006Z",
};

/**
 * The standing filings for the four articles that shipped with this example —
 * the back catalogue, as opposed to the two filings the seeded workflow runs
 * create for themselves.
 *
 * Appended through the relation store's own `appendRelation`, which dedups on
 * content hash, so re-running the seed appends nothing and emits no second audit
 * event. Endpoint ids are `<entityType>/<slug>`; both endpoints must resolve to
 * a VALID page of the declared type or the store reports a dangling relation.
 */
export const STANDING_FILINGS = [
  { type: "filed-under", from: "articles/transit-levy-audit", to: "desks/investigations" },
  { type: "filed-under", from: "articles/harbour-lease-records", to: "desks/investigations" },
  { type: "filed-under", from: "articles/school-meals-contract", to: "desks/metro" },
  { type: "filed-under", from: "articles/night-bus-cuts", to: "desks/metro" },
];

/*
 * The two page bodies below have NO counterpart under `content/`, on purpose:
 * the typed page write path is CREATE-ONLY, so an existing target is a collision
 * and the write is parked for review instead of applied. A committed copy would
 * stop the gate-parked run from ever leaving `draft-article`.
 */

/** The article page the gate-parked run produces at its `draft-article` stage. */
const DOCK_STRIKE_BODY = `---
title: Dock Strike Ballot
headline: Dock operators' ballot closes with a 71% strike mandate
stage: draft
---

# Dock Strike Ballot

The container terminal's two operating companies face coordinated action from
next month after a ballot closed with a 71% mandate on a 64% turnout.

Written live by this example's \`seed.mjs\`, as the output of the
\`draft-article\` stage of run \`story-pipeline-dock-strike\`. It is generated
state, not committed content — see this example's README.
`;

/** The article page the completed run produces at its `draft-article` stage. */
const LIBRARY_CLOSURES_BODY = `---
title: Library Closures List
headline: Six branch libraries named in the draft closure list
stage: draft
---

# Library Closures List

Six of the borough's nineteen branch libraries appear on a draft closure list
circulated to ward councillors ahead of the budget consultation.

Written live by this example's \`seed.mjs\`, as the output of the
\`draft-article\` stage of run \`story-pipeline-library-closures\`. It is
generated state, not committed content — see this example's README.
`;

/**
 * The five runs of `story-pipeline` this example seeds, each pinned to a fixed
 * `runId` so re-seeding can skip a run that already exists instead of piling up
 * near-duplicates.
 *
 * Between them they cover every row a run list has to render: both actionable
 * parked states (`awaitingOutput` and `awaitingGate`), both terminal outcomes
 * (`completed` and `cancelled`), and a freshly-started run that has not moved.
 *
 * | Run | Ends at | status | Reported as |
 * | --- | --- | --- | --- |
 * | `story-pipeline-ferry-inquiry` | `draft-article` | `running` | `awaitingOutput` |
 * | `story-pipeline-dock-strike` | `file-under-desk` | `running` | `awaitingGate: edited` |
 * | `story-pipeline-library-closures` | — | `completed` | `historical` |
 * | `story-pipeline-arena-deal` | — | `cancelled` | `historical` |
 * | `story-pipeline-night-bus` | `draft-article` | `pending` | `current`, unparked |
 *
 * The gate-parked run is the fiddly one, and the reason its plan has six steps:
 * `file-under-desk` declares BOTH a gate and writes, so a run that has not
 * submitted its filing reports `awaitingGate` AND `awaitingOutput` at once.
 * Submitting the filing first leaves the gate as the only outstanding
 * requirement, which is what makes it a clean `awaitingGate` row.
 */
export const RUN_PLANS = [
  {
    runId: "story-pipeline-ferry-inquiry",
    inputs: { headline: "Ferry terminal rebuild overruns", desk: "investigations" },
    steps: [{ do: "advance" }],
  },
  {
    runId: "story-pipeline-dock-strike",
    inputs: { headline: "Dock operators' strike ballot", desk: "investigations" },
    steps: [
      { do: "advance" },
      { do: "submit-page", entityType: "articles", slug: "dock-strike-ballot", body: DOCK_STRIKE_BODY },
      { do: "advance" },
      { do: "submit-relation", type: "filed-under", from: "articles/dock-strike-ballot", to: "desks/investigations" },
      { do: "advance" },
    ],
  },
  {
    runId: "story-pipeline-library-closures",
    inputs: { headline: "Draft library closure list", desk: "metro" },
    steps: [
      { do: "advance" },
      { do: "submit-page", entityType: "articles", slug: "library-closures-list", body: LIBRARY_CLOSURES_BODY },
      { do: "advance" },
      { do: "submit-relation", type: "filed-under", from: "articles/library-closures-list", to: "desks/metro" },
      { do: "approve-gate", gate: "edited", actorLabel: "seed.mjs" },
      { do: "advance" },
    ],
  },
  {
    runId: "story-pipeline-arena-deal",
    inputs: { headline: "Arena redevelopment deal", desk: "metro" },
    steps: [{ do: "advance" }, { do: "cancel" }],
  },
  {
    runId: "story-pipeline-night-bus",
    inputs: { headline: "Night bus network consultation", desk: "metro" },
    steps: [],
  },
];
