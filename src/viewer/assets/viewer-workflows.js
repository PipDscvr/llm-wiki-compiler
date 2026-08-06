/**
 * llmwiki viewer — the #/workflows list route.
 *
 * A peer of #/reviews: same `.list-row` language, same empty-state contract,
 * and the same reason for living outside viewer-lists.js — the routes there all
 * render from the already-fetched /api/pages envelope, while workflow runs live
 * under `.llmwiki/workflows/runs/`, outside the frozen snapshot, so this route
 * is fed by a per-visit /api/workflow-runs fetch.
 *
 * The route exists for the PARKED runs. A run waiting on a gate approval or a
 * stage-output submission is a work item blocked on a human; a run that is
 * merely running or completed needs nothing. So a parked row is marked as such
 * on the row itself and names the CLI command that moves it. Naming a command
 * is as far as this goes: the viewer is a read-only snapshot with no write path,
 * and a button implying otherwise would be a lie.
 *
 * A `problem` row (an unavailable or malformed run store) renders AS a problem.
 * The endpoint deliberately reports a broken store as a fail-visible row rather
 * than an empty list — dropping it here, or dressing it as a normal run, would
 * undo that and let a broken store read as "no runs".
 */

import { el, emptyState, heading } from "./viewer-dom.js";

/**
 * Human wording for the classifications worth stating (see
 * `src/workflows/status.ts`). `current` is deliberately absent: it is the
 * unremarkable default relationship to the active profile, and a chip on every
 * healthy row would bury the two that mean the run cannot be acted on. An
 * unknown classification falls through to its raw value, so one added later is
 * visible-but-ugly rather than silently invisible.
 */
const CLASSIFICATION_LABELS = {
  historical: "History",
  "needs-adaptation": "Needs adaptation",
  "blocked-by-config": "Blocked by config",
};

/** Shown in place of the stage id when a run sits on no stage (e.g. a finished run). */
const NO_STAGE = "no stage";

/**
 * The command that lists what the active profile declares. It is the right
 * first command for BOTH readings of an empty list — a profile with no
 * workflows at all (the common one; the default profile declares none) and a
 * profile whose workflows have simply never been run.
 */
const WORKFLOW_LIST_COMMAND = "$ llmwiki workflow list";

/**
 * Render the workflow-runs route from an `/api/workflow-runs` payload.
 *
 * @param {HTMLElement} main - The main pane to render into.
 * @param {{runs?: unknown[]}} payload - The `/api/workflow-runs` envelope.
 */
export function renderWorkflowRunsList(main, payload) {
  const runs = runsIn(payload);
  main.innerHTML = "";
  main.className = "main-pane list-pane";
  main.appendChild(heading("h1", "Workflows"));
  const body = el("div", "list-body");
  main.appendChild(body);
  if (runs.length === 0) {
    body.appendChild(emptyWorkflowsState());
    return;
  }
  for (const run of runs) body.appendChild(buildRunRow(run));
}

/** The rows in an `/api/workflow-runs` envelope, defended against a malformed payload. */
function runsIn(payload) {
  return Array.isArray(payload?.runs) ? payload.runs : [];
}

/**
 * Empty state for a project with no runs. Most projects have none — workflows
 * are a Configurable Lifecycle Profile feature and the default profile declares
 * none — so this is a normal, common state, not a failure, and it gets the
 * teaching card rather than the italic loading placeholder.
 */
function emptyWorkflowsState() {
  return emptyState(
    "No workflow runs",
    "Workflows are the staged pipelines a profile declares — each run advances through them, parking whenever it needs a human to approve a gate or submit a stage output.",
    WORKFLOW_LIST_COMMAND,
  );
}

/** True when the row describes an unavailable or malformed run store, not a run. */
function isProblemRow(run) {
  return typeof run?.problem === "string" && run.problem.length > 0;
}

/** True when the run is blocked on a human — a gate approval or a stage output. */
function isParked(run) {
  return typeof run?.awaitingGate === "string" || run?.awaitingOutput === true;
}

/** Build one row, dispatching on whether it reports a run or a broken store. */
function buildRunRow(run) {
  if (isProblemRow(run)) return buildProblemRow(run);
  const row = el("div", `list-row workflow-row${isParked(run) ? " is-parked" : ""}`);
  row.appendChild(buildRunHead(run));
  row.appendChild(el("p", "workflow-meta", runMetaText(run)));
  const flags = buildRunFlags(run);
  if (flags) row.appendChild(flags);
  appendNextCommands(row, run);
  return row;
}

/**
 * Head line: the workflow the run belongs to, plus the run id. The workflow is
 * the title because it is what the reader recognises; the id is what the CLI
 * commands below take, so it sits beside it in mono rather than being hidden.
 */
function buildRunHead(run) {
  const head = el("div", "workflow-head");
  head.appendChild(el("span", "list-title", workflowNameOf(run)));
  head.appendChild(el("span", "workflow-run-id", String(run.runId ?? "")));
  return head;
}

/**
 * The workflow id, or a plain statement when the row carries none. A readable
 * run always names its workflow; a row without one is malformed, and an empty
 * title line would read as a rendering bug rather than as missing data.
 */
function workflowNameOf(run) {
  const workflow = typeof run.workflow === "string" ? run.workflow.trim() : "";
  return workflow.length > 0 ? workflow : "Unknown workflow";
}

/** Meta line: lifecycle status and the stage the run currently sits on. */
function runMetaText(run) {
  const status = typeof run.status === "string" && run.status.length > 0 ? run.status : "unknown";
  return `${status} · ${stageTextOf(run)}`;
}

/** The current stage id, or the no-stage wording when the run sits on none. */
function stageTextOf(run) {
  const stage = typeof run.currentStage === "string" ? run.currentStage.trim() : "";
  return stage.length > 0 ? stage : NO_STAGE;
}

/**
 * Build the chip row. Returns null when there is nothing to say, so an
 * ordinary running row does not carry an empty strip.
 */
function buildRunFlags(run) {
  const labels = flagLabels(run);
  if (labels.length === 0) return null;
  const wrap = el("div", "workflow-flags");
  for (const { text, parked } of labels) wrap.appendChild(buildFlag(text, parked));
  return wrap;
}

/**
 * The chips a run earns, in reading order: what it is parked on, then how it
 * relates to the active profile when that is worth stating.
 */
function flagLabels(run) {
  const parked = parkLabels(run).map((text) => ({ text, parked: true }));
  const classification = CLASSIFICATION_LABELS[run.classification];
  return classification ? [...parked, { text: classification, parked: false }] : parked;
}

/** One chip. A parked chip takes the warn treatment; anything else is neutral. */
function buildFlag(text, parked) {
  return el("span", `workflow-flag${parked ? " is-parked" : ""}`, text);
}

/**
 * The parked states, in the order they must be cleared: a stage output is
 * submitted before the gate guarding that stage can be approved, so a run
 * carrying both reads top-to-bottom as the sequence of work it needs.
 */
function parkLabels(run) {
  const labels = [];
  if (run.awaitingOutput === true) labels.push("Awaiting stage output");
  if (typeof run.awaitingGate === "string") labels.push(`Awaiting gate · ${run.awaitingGate}`);
  return labels;
}

/**
 * Append one command line per parked state — the CLI that unparks the run.
 * Text only, never a control: this viewer cannot mutate a run, and the row must
 * not imply that it can.
 */
function appendNextCommands(row, run) {
  for (const command of nextCommands(run)) {
    row.appendChild(el("p", "workflow-next", command));
  }
}

/** The unpark commands for a run, in the same order as {@link parkLabels}. */
function nextCommands(run) {
  const runId = String(run.runId ?? "");
  const commands = [];
  if (run.awaitingOutput === true) commands.push(`$ llmwiki workflow submit ${runId}`);
  if (typeof run.awaitingGate === "string") {
    commands.push(`$ llmwiki workflow gate approve ${runId} ${run.awaitingGate}`);
  }
  return commands;
}

/**
 * Build a problem row: the run (or store) the trouble is attributed to, and why
 * it could not be read. No status, stage, or unpark command — the row describes
 * something unreadable, and inventing lifecycle fields for it would present a
 * broken store as a working run.
 */
function buildProblemRow(run) {
  const row = el("div", "list-row workflow-row is-problem");
  const head = el("div", "workflow-head");
  head.appendChild(el("span", "list-title", String(run.runId ?? "Unknown run")));
  head.appendChild(el("span", "workflow-flag is-problem", "Problem"));
  row.appendChild(head);
  row.appendChild(el("p", "workflow-problem", run.problem));
  return row;
}
