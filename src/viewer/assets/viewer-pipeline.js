/**
 * llmwiki viewer — the `#/pipeline` route.
 *
 * One panel, one row per declared entity type, three columns: what the type's
 * lifecycle IS, where its pages currently sit, and what the difference between
 * those two numbers means.
 *
 * The third column is the reason the route earns its own screen. Two collectors
 * walk the same directory with different filters — `entityCounts` validates each
 * page against its field contract, `tallyLifecycleStates` does not — so the tally
 * sum minus the valid count is precisely the pages that failed validation and
 * still declare a lifecycle state. That is a finding with a number, not a
 * discrepancy to apologise for, so the column names it.
 *
 * Colour is never decoration here: `viewer-pipeline-model.js` decides each
 * state's role from the profile's own `initial`/`terminal`/`transitions`, and
 * this module only paints what it is told. Where hue carries meaning the label
 * carries it too — an unreachable chip says "unreachable" in words — so the
 * panel does not depend on colour vision to be read.
 *
 * TIME-IN-STATE IS DELIBERATELY ABSENT. "Oldest draft, 9 days" needs a per-page
 * timestamp recorded when the state was entered, and nothing anywhere records
 * one; a file mtime answers a different question. Flagged, not faked.
 */

import { el, emptyState } from "./viewer-dom.js";
import { plural } from "./viewer-format.js";
import { classifyStates, hasDeclaredOrder, reachableOrder, segmentWidths } from "./viewer-pipeline-model.js";

/** The three column heads, left to right. */
const COLUMN_HEADS = ["ENTITY TYPE · LIFECYCLE", "STATE TALLY", "TALLY VS VALID PAGES"];

/** The legend, in the order the model derives the roles it names. */
const LEGEND = [
  { role: "flight", label: "in flight" },
  { role: "terminal", label: "terminal" },
  { role: "unreachable", label: "unreachable" },
];

/** Where the panel's footer sends a reader for the full problem list. */
const LINT_HREF = "#/health";

/**
 * Render the Pipeline route from the `/api/pages` envelope.
 *
 * @param {HTMLElement} main - The main pane to render into.
 * @param {object} envelope - The `/api/pages` envelope.
 */
export function renderPipeline(main, envelope) {
  main.innerHTML = "";
  main.className = "main-pane pipeline-pane";
  const pipeline = envelope?.profilePipeline;
  if (!pipeline?.entityTypes?.length) {
    main.appendChild(emptyPipelineState());
    return;
  }
  main.appendChild(buildPanel(pipeline, envelope));
}

/**
 * Shown when the envelope carries no pipeline at all. Only a profile declares
 * entity types and lifecycles, so this is the default project's normal state —
 * a fact about the project, not a failure — and it gets the teaching card.
 */
function emptyPipelineState() {
  return emptyState(
    "No lifecycle to show",
    "A profile declares the entity types this project keeps and the states each one moves through. The default profile declares neither, so there is no pipeline to draw.",
    "$ llmwiki template init",
  );
}

/** Build the whole panel: head, column heads, type rows, relations, footer. */
function buildPanel(pipeline, envelope) {
  const panel = el("section", "panel pipeline-panel");
  panel.appendChild(buildPanelHead(envelope));
  panel.appendChild(buildColumnHeads());
  for (const row of pipeline.entityTypes) panel.appendChild(buildTypeRow(row));
  panel.appendChild(buildRelationBand(pipeline.relationTypes));
  const footer = buildFooter(pipeline.entityTypes, envelope);
  if (footer) panel.appendChild(footer);
  return panel;
}

/** Panel head: the title, the active profile's name, and the role legend. */
function buildPanelHead(envelope) {
  const profileId = envelope?.profileId;
  const head = el("div", "panel-head pipeline-head");
  const group = el("div", "pipeline-head-group");
  group.appendChild(el("span", "panel-title", "Pipeline"));
  if (profileId) group.appendChild(el("span", "pipeline-profile-badge", profileId.toUpperCase()));
  head.appendChild(group);
  const legend = el("div", "pipeline-legend");
  for (const entry of LEGEND) legend.appendChild(buildLegendItem(entry));
  legend.appendChild(el("span", "pipeline-legend-note", "order from declared transitions"));
  head.appendChild(legend);
  return head;
}

/** One legend entry: the swatch in its role's treatment, then the role's name. */
function buildLegendItem(entry) {
  const item = el("span", "pipeline-legend-item");
  item.appendChild(el("span", `pipeline-swatch is-${entry.role} is-legend`));
  item.appendChild(el("span", undefined, entry.label));
  return item;
}

/** The three column labels, on the same grid every row below uses. */
function buildColumnHeads() {
  const head = el("div", "pipeline-columns pipeline-column-head");
  head.appendChild(el("span", undefined, COLUMN_HEADS[0]));
  head.appendChild(el("span", undefined, COLUMN_HEADS[1]));
  head.appendChild(el("span", "pipeline-col-right", COLUMN_HEADS[2]));
  return head;
}

/** Build one entity type's row across all three columns. */
function buildTypeRow(row) {
  const states = classifyStates(row.lifecycle, row.stateCounts);
  const wrap = el("div", "pipeline-columns pipeline-row");
  wrap.dataset.entityType = row.type;
  wrap.appendChild(buildTypeCell(row));
  wrap.appendChild(buildTallyCell(row, states));
  wrap.appendChild(buildVerdictCell(row, states));
  return wrap;
}

/** Left column: the type's name and valid page count, then what it declares. */
function buildTypeCell(row) {
  const cell = el("div", "pipeline-type");
  const head = el("div", "pipeline-type-head");
  head.appendChild(el("span", "pipeline-type-name", typeLabel(row.type)));
  head.appendChild(el("span", "pipeline-type-count", String(row.pageCount ?? 0)));
  cell.appendChild(head);
  const chain = reachableOrder(row.lifecycle);
  if (hasDeclaredOrder(row.lifecycle) && chain.length > 1) {
    cell.appendChild(el("div", "pipeline-chain", chain.join(" → ")));
  }
  cell.appendChild(el("div", "pipeline-declared", declaredText(row.lifecycle)));
  return cell;
}

/**
 * The entity type id with its first letter capitalised — `articles` reads as
 * `Articles`. Never a lookup table: the id is the profile author's word, and
 * translating it would put a second name on the same thing.
 */
function typeLabel(type) {
  const id = String(type ?? "");
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * The line under the chain, stating what the profile declared rather than what
 * was derived from it. A lifecycle with neither a terminal state nor an edge
 * says so plainly: there is no order to show, and implying one would be a claim
 * the profile never made.
 */
function declaredText(lifecycle) {
  if (!lifecycle) return "no lifecycle declared";
  return hasDeclaredOrder(lifecycle) ? orderedDeclaredText(lifecycle) : orderlessDeclaredText(lifecycle);
}

/** A lifecycle with neither a terminal state nor an edge: what it declared, and nothing more. */
function orderlessDeclaredText(lifecycle) {
  const declared = lifecycle.declaredStates?.length ?? 0;
  return `${plural(declared, "state")} declared · no transitions, no terminal — order not derivable, so none is implied`;
}

/** A lifecycle that does order its states: where it starts and where it ends. */
function orderedDeclaredText(lifecycle) {
  const terminal = lifecycle.terminal ?? [];
  const initial = `initial ${lifecycle.initial}`;
  return terminal.length > 0 ? `${initial} · terminal ${terminal.join(", ")}` : initial;
}

/** Middle column: the proportional bar, a chip per state, and any callout. */
function buildTallyCell(row, states) {
  const cell = el("div", "pipeline-tally");
  if (states.length === 0) {
    cell.appendChild(el("div", "pipeline-none", "no pages carry a lifecycle state"));
    return cell;
  }
  cell.appendChild(buildBar(states));
  const chips = el("div", "pipeline-chips");
  for (const state of states) chips.appendChild(buildChip(state));
  cell.appendChild(chips);
  for (const state of states.filter((entry) => entry.role === "unreachable")) {
    cell.appendChild(buildCallout(state, row.lifecycle));
  }
  return cell;
}

/**
 * The proportional bar. Widths and fill strengths are CSSOM property writes,
 * not markup `style=` attributes, so the panel needs no `unsafe-inline` in
 * `style-src` — the same mechanism the dashboard's meters already use.
 */
function buildBar(states) {
  const bar = el("div", "pipeline-bar");
  const widths = segmentWidths(states.map((state) => state.count));
  states.forEach((state, index) => {
    const segment = el("div", `pipeline-seg is-${state.role}`);
    segment.style.width = `${widths[index]}%`;
    segment.style.opacity = String(state.alpha);
    bar.appendChild(segment);
  });
  return bar;
}

/** One state chip: its swatch, its name, its count, and its role when that matters. */
function buildChip(state) {
  const chip = el("span", `pipeline-chip is-${state.role}`);
  chip.dataset.state = state.state;
  const swatch = el("span", `pipeline-swatch is-${state.role}`);
  swatch.style.opacity = String(state.alpha);
  chip.appendChild(swatch);
  chip.appendChild(el("span", undefined, chipLabel(state)));
  return chip;
}

/**
 * The chip's text. An unreachable chip names its role in words as well as in
 * hue: the finding must survive a reader who cannot tell the red from the
 * violet, and it is the one role the chain line above does not already name.
 */
function chipLabel(state) {
  const base = `${state.state} ${state.count}`;
  return state.role === "unreachable" ? `${base} · unreachable` : base;
}

/**
 * The inline callout naming an unreachable state. Two readings, and they are
 * different findings: a state the lifecycle DECLARES but no transition reaches
 * is a hole in the state machine; a state that is not a declared value at all
 * never passed validation in the first place. Both end the same way, because
 * both mean a person edited the frontmatter by hand.
 */
function buildCallout(state, lifecycle) {
  const box = el("div", "pipeline-callout");
  const pages = plural(state.count, "page");
  box.appendChild(document.createTextNode(`${pages} ${state.count === 1 ? "sits" : "sit"} in `));
  box.appendChild(el("code", "pipeline-callout-state", state.state));
  box.appendChild(document.createTextNode(` — ${calloutReason(state.state, lifecycle)}, `));
  box.appendChild(
    document.createTextNode("so the lifecycle cannot produce it. Hand-edited frontmatter."),
  );
  return box;
}

/**
 * Why this state is unreachable, in the profile's own vocabulary. `lifecycle` is
 * always present here: only a type whose transitions order its states can have
 * an unreachable one at all.
 */
function calloutReason(state, lifecycle) {
  const field = lifecycle.field ?? "the lifecycle field";
  if (isUndeclaredState(state, lifecycle)) return `not a declared \`${field}\` value at all`;
  return `declared on \`${field}\` but no transition reaches it from \`${lifecycle.initial}\``;
}

/** True when the lifecycle field's enum never listed this state as a legal value. */
function isUndeclaredState(state, lifecycle) {
  const declared = lifecycle.declaredStates;
  return Array.isArray(declared) && !declared.includes(state);
}

/** Right column: the tally sum, and what its distance from the valid count means. */
function buildVerdictCell(row, states) {
  const cell = el("div", "pipeline-verdict");
  if (!row.lifecycle) {
    cell.appendChild(el("div", "pipeline-sum is-empty", "—"));
    cell.appendChild(el("div", "pipeline-gap is-clean", "no lifecycle declared"));
    return cell;
  }
  const sum = states.reduce((total, state) => total + state.count, 0);
  const rejected = Math.max(0, sum - (row.pageCount ?? 0));
  cell.appendChild(el("div", "pipeline-sum", String(sum)));
  const gapClass = rejected > 0 ? "pipeline-gap" : "pipeline-gap is-clean";
  cell.appendChild(el("div", gapClass, gapText(rejected)));
  return cell;
}

/** The finding under the tally sum: the rejected pages inside it, or none. */
function gapText(rejected) {
  return rejected > 0 ? `${plural(rejected, "rejected page")} counted here` : "every page valid";
}

/** The relation-types band: one chip per declared type, plus a one-line summary. */
function buildRelationBand(declared) {
  const relationTypes = declared ?? [];
  const band = el("div", "pipeline-columns pipeline-relations");
  const label = el("div");
  label.appendChild(el("div", "pipeline-eyebrow", "RELATION TYPES"));
  label.appendChild(
    el("div", "pipeline-relations-note", "endpoints and direction come from the profile"),
  );
  band.appendChild(label);
  const chips = el("div", "pipeline-relation-chips");
  for (const relation of relationTypes) chips.appendChild(buildRelationChip(relation));
  band.appendChild(chips);
  band.appendChild(el("div", "pipeline-relations-summary", relationSummary(relationTypes)));
  return band;
}

/** One relation chip: its name, its endpoints, its direction, and its live count. */
function buildRelationChip(relation) {
  const chip = el("span", "pipeline-relation-chip");
  chip.dataset.relationType = relation.type;
  chip.appendChild(el("span", "pipeline-relation-name", relation.type));
  chip.appendChild(el("span", "pipeline-relation-endpoint", (relation.from ?? []).join(", ")));
  chip.appendChild(el("span", "pipeline-relation-arrow", directionArrow(relation.direction)));
  chip.appendChild(el("span", "pipeline-relation-endpoint", (relation.to ?? []).join(", ")));
  chip.appendChild(el("span", "pipeline-relation-count", String(relation.count ?? 0)));
  return chip;
}

/** `symmetric` endpoints are an unordered pair, so the arrow points both ways. */
function directionArrow(direction) {
  return direction === "symmetric" ? "↔" : "→";
}

/** "1 type · directed", or just the count when the profile mixes directions. */
function relationSummary(relationTypes) {
  const count = plural(relationTypes.length, "type");
  const directions = new Set(relationTypes.map((relation) => relation.direction));
  return directions.size === 1 ? `${count} · ${[...directions][0]}` : count;
}

/**
 * The footer band: what the rejected pages inside the tallies above actually
 * are. Present only when there is something to report — a project whose every
 * page validates has no finding here, and a permanently empty band would train
 * a reader to stop looking at it.
 */
function buildFooter(entityTypes, envelope) {
  const rejected = totalRejected(entityTypes);
  const problems = problemTotalOf(envelope);
  if (rejected + problems === 0) return null;
  const band = el("div", "pipeline-footer");
  band.appendChild(el("span", "pipeline-footer-text", footerText(rejected)));
  const link = el("a", "pipeline-footer-link", `See all ${plural(problems, "problem")} in Lint →`);
  link.href = LINT_HREF;
  band.appendChild(link);
  return band;
}

/** How many profile problems the envelope reported, or none at all. */
function problemTotalOf(envelope) {
  return envelope?.profileProblemTotal ?? 0;
}

/** Rejected pages across every type — the sum of each row's own gap. */
function totalRejected(entityTypes) {
  return entityTypes.reduce((total, row) => {
    const sum = Object.values(row.stateCounts ?? {}).reduce((acc, count) => acc + count, 0);
    return total + Math.max(0, sum - (row.pageCount ?? 0));
  }, 0);
}

/**
 * The footer's sentence. A rejected page that omits the lifecycle field
 * entirely appears in NO tally, so the count above is a floor on the rejects,
 * never the whole set — the band says so rather than letting the number read as
 * the total.
 */
function footerText(rejected) {
  if (rejected === 0) {
    return "No rejected page declares a lifecycle state, so every tally above counts profile-valid pages only.";
  }
  const clause = rejected === 1 ? "declares a lifecycle state and is" : "declare a lifecycle state and are";
  return `${plural(rejected, "rejected page")} still ${clause} counted in the tallies above. A rejected page that omits the field entirely appears in no tally at all.`;
}
