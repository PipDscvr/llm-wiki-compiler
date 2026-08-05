/**
 * llmwiki viewer — Overview dashboard.
 *
 * Four stat cards, a hero banner, the recently-compiled list, a graph panel
 * container, a compile receipt, and a next-actions list.
 *
 * The cards keep the design's inventory/signal split: two report what the
 * wiki HAS, two report what needs a human. "Needs attention" is derived from
 * dangling links plus unresolved citations — both always present in the
 * snapshot — rather than from the lint cache, which is null until the first
 * `llmwiki lint` run and would leave the focal card blank on a new project.
 * Lint instead appears in the receipt and next actions, where "never run"
 * reads naturally.
 *
 * Next actions are informational. The viewer is read-only and cannot run any
 * of them, so each names the CLI command rather than offering a dead button.
 */

import { el, emptyState } from "./viewer-dom.js";
import { lintTotal, relativeAge } from "./viewer-format.js";

/** Stat card definitions: key, label, badge, and value/sub-line derivations. */
const STAT_CARDS = [
  {
    key: "concepts",
    label: "Concepts",
    badge: "PAGES",
    value: (m) => m.counts.concepts ?? 0,
    sub: (m) => `${m.totalCitations} citations · ${m.pageCount} pages`,
  },
  {
    key: "sources",
    label: "Sources",
    badge: "INPUT",
    value: (m) => m.counts.sourceFiles ?? 0,
    sub: (m) => `${m.counts.compiledSources ?? 0} compiled · ${m.counts.sourceFiles ?? 0} on disk`,
  },
  {
    key: "attention",
    label: "Needs attention",
    badge: "CHECKS",
    warnWhenNonZero: true,
    value: (m) => m.attention,
    sub: (m) => `${m.dangling} dangling · ${m.unresolved} unresolved citations`,
  },
  {
    key: "reviews",
    label: "Awaiting review",
    badge: "QUEUE",
    warnWhenNonZero: true,
    value: (m) => m.counts.pendingReviews ?? 0,
    sub: (m) =>
      (m.counts.pendingReviews ?? 0) === 0
        ? "queue is empty"
        : `${m.counts.pendingReviews} candidates`,
  },
];

/** The four explainer columns. Static copy — no data behind them. */
const PATTERN_COLUMNS = [
  ["01 · COMPILE ONCE", "Knowledge is extracted once into durable pages instead of re-discovered from raw files at query time."],
  ["02 · TRACEABLE", "Every claim carries a source span you can open at the exact line and verify yourself."],
  ["03 · AGENT & HUMAN", "The same pages browse well, lint cleanly, and export as retrieval-ready context."],
  ["04 · PROFILES", "Domain types and workflows arrive as profiles — no domain branches inside the compiler."],
];

/**
 * Render the Overview dashboard.
 *
 * @param {HTMLElement} main - The main pane.
 * @param {object} envelope - The /api/pages envelope.
 * @param {object|null} health - The /api/health payload, or null if it failed.
 */
export function renderDashboard(main, envelope, health) {
  const model = buildModel(envelope, health);
  main.innerHTML = "";
  main.className = "main-pane dashboard";
  const primary = el("div", "dashboard-primary");
  primary.appendChild(buildStatGrid(model));
  primary.appendChild(buildHero(model));
  primary.appendChild(buildSplit(model));
  primary.appendChild(buildPatternStrip());
  main.appendChild(primary);
  main.appendChild(buildRail(model));
}

/** Derive every number the dashboard renders from the two payloads. */
// Optional chaining and nullish-coalescing defaults across the envelope and
// health payloads inflate cyclomatic count for what is a flat projection
// into one model object (cognitive complexity: 6).
// fallow-ignore-next-line complexity
function buildModel(envelope, health) {
  const pages = Array.isArray(envelope?.pages) ? envelope.pages : [];
  const dangling = envelope?.graph?.danglingCount ?? 0;
  const unresolved = sumBy(pages, (p) => p.unresolvedCitationCount ?? 0);
  const totalCitations = sumBy(pages, (p) => p.citationCount ?? 0);
  return {
    envelope,
    counts: envelope?.counts ?? {},
    graph: envelope?.graph ?? { nodeCount: 0, edgeCount: 0, danglingCount: 0 },
    recentPages: envelope?.recentPages ?? [],
    freshnessById: freshnessIndex(pages),
    pageCount: pages.length,
    totalCitations,
    unresolved,
    dangling,
    attention: dangling + unresolved,
    lint: health?.lint ?? null,
  };
}

/** Sum a numeric projection over a list. */
function sumBy(items, project) {
  return items.reduce((total, item) => total + project(item), 0);
}

/** Index page freshness by page id so recent rows can join against it. */
function freshnessIndex(pages) {
  const index = new Map();
  for (const page of pages) index.set(page.id, page.freshness);
  return index;
}

/** Build the four-card stat grid. */
function buildStatGrid(model) {
  const grid = el("div", "stat-grid");
  for (const card of STAT_CARDS) grid.appendChild(buildStatCard(card, model));
  return grid;
}

/** Build one stat card. */
function buildStatCard(card, model) {
  const value = card.value(model);
  const warn = card.warnWhenNonZero === true && value > 0;
  const wrap = el("div", `stat-card${warn ? " is-warn" : ""}`);
  wrap.dataset.stat = card.key;
  const head = el("div", "stat-head");
  head.appendChild(el("span", "stat-label", card.label));
  head.appendChild(el("span", "stat-badge", card.badge));
  wrap.appendChild(head);
  wrap.appendChild(el("div", "stat-value", String(value)));
  wrap.appendChild(el("div", "stat-sub", card.sub(model)));
  return wrap;
}

/** Build the hero banner with its two calls to action. */
function buildHero(model) {
  const hero = el("div", "hero");
  const copy = el("div", "hero-copy");
  copy.appendChild(el("div", "hero-title", "Your knowledge base is ready."));
  copy.appendChild(
    el("div", "hero-body",
      `${model.counts.concepts ?? 0} pages, ${model.totalCitations} citations traced to source spans.`),
  );
  hero.appendChild(copy);
  const actions = el("div", "hero-actions");
  if (model.envelope?.index?.available) {
    const index = el("a", "button button-primary", "Browse compiled index →");
    index.href = "#/index";
    actions.appendChild(index);
  }
  const graph = el("a", "button button-secondary", "Explore graph");
  graph.href = "#/graph";
  actions.appendChild(graph);
  hero.appendChild(actions);
  return hero;
}

/** Build the two-column split: recently compiled beside the graph panel. */
function buildSplit(model) {
  const split = el("div", "dashboard-split");
  split.appendChild(buildRecentPanel(model));
  split.appendChild(buildGraphPanel(model));
  return split;
}

/** Build the recently-compiled panel. */
function buildRecentPanel(model) {
  const panel = buildPanel("Recently compiled");
  const body = el("div", "panel-body");
  if (model.recentPages.length === 0) {
    body.appendChild(
      emptyState(
        "Nothing compiled yet",
        "Compiled pages appear here newest first, each with its citation count and freshness.",
        "$ llmwiki compile",
      ),
    );
  }
  for (const page of model.recentPages) {
    body.appendChild(buildRecentRow(page, model.freshnessById.get(page.id)));
  }
  panel.appendChild(body);
  panel.appendChild(buildPanelFooter("cited pages, most recent first", "All concepts →", "#/concepts"));
  return panel;
}

/** Build one recently-compiled row. */
// Optional chaining, a status ternary, and a title fallback inflate
// cyclomatic count for what stays a single flat row builder
// (cognitive complexity: 3).
// fallow-ignore-next-line complexity
function buildRecentRow(page, freshness) {
  const row = el("div", "recent-row");
  const status = freshness?.freshnessStatus ?? "unverified";
  const dot = el("span", `list-dot ${status === "fresh" ? "is-ok" : "is-warn"}`);
  dot.title = status;
  dot.setAttribute("aria-label", status);
  row.appendChild(dot);
  const link = el("a", "recent-title", page.title || page.slug);
  link.href = `#/${encodeURIComponent(page.pageDirectory)}/${encodeURIComponent(page.slug)}`;
  row.appendChild(link);
  row.appendChild(el("span", "recent-age", relativeAge(page.updatedAt)));
  return row;
}

/**
 * Build the graph panel shell. Task 11 renders a compact graph into
 * `[data-graph-panel]`; until then it holds the counts and legend only.
 */
function buildGraphPanel(model) {
  const panel = buildPanel("Knowledge graph");
  panel.appendChild(
    el("div", "panel-caption", `${model.graph.nodeCount} nodes · ${model.graph.edgeCount} edges`),
  );
  const surface = el("div", "graph-panel-surface");
  surface.dataset.graphPanel = "";
  panel.appendChild(surface);
  panel.appendChild(
    buildPanelFooter(`${model.graph.danglingCount} dangling targets`, "Open explorer →", "#/graph"),
  );
  return panel;
}

/** Build the right rail: compile receipt, next actions, snapshot note. */
function buildRail(model) {
  const rail = el("div", "dashboard-rail");
  rail.appendChild(buildReceipt(model));
  rail.appendChild(buildNextActions(model));
  const note = el("div", "snapshot-note");
  note.appendChild(
    el("span", undefined,
      "The viewer serves a frozen snapshot. Changes on disk appear after llmwiki view restarts."),
  );
  rail.appendChild(note);
  return rail;
}

/** Build the compile receipt panel. */
function buildReceipt(model) {
  const panel = buildPanel("Compile receipt");
  panel.dataset.compileReceipt = "";
  const body = el("div", "panel-body receipt-body");
  for (const [label, value] of receiptRows(model)) {
    const row = el("div", "receipt-row");
    row.appendChild(el("span", "receipt-label", label));
    row.appendChild(el("span", "receipt-value", value));
    body.appendChild(row);
  }
  body.appendChild(buildCitationBar(model));
  panel.appendChild(body);
  return panel;
}

/** Receipt label/value rows drawn from the envelope and lint cache. */
// Optional chaining and nullish-coalescing defaults across four independent
// envelope fields, plus the lint ternary, inflate cyclomatic count for what
// is a flat row-list projection (cognitive complexity: 5).
// fallow-ignore-next-line complexity
function receiptRows(model) {
  const rows = [
    ["Root", model.envelope?.project?.rootName ?? "—"],
    ["Profile", model.envelope?.profileId ?? "default"],
    ["State", model.envelope?.stateStatus ?? "unknown"],
    ["Index", model.envelope?.index?.available ? "available" : "not compiled"],
  ];
  rows.push(["Lint", model.lint ? `${lintTotal(model.lint)} findings` : "never run"]);
  return rows;
}

/**
 * Build the citations-resolved bar. This replaces the mockup's
 * "Traceability" bar, which was backed by a claim inventory the compiler
 * does not maintain; citation resolution is the equivalent fact that IS
 * tracked.
 */
function buildCitationBar(model) {
  const total = model.totalCitations;
  const resolved = total - model.unresolved;
  const percent = total === 0 ? 100 : Math.round((resolved / total) * 100);
  const wrap = el("div", "receipt-bar");
  const head = el("div", "receipt-row");
  head.appendChild(el("span", "receipt-label", "Citations resolved"));
  head.appendChild(el("span", "receipt-value", `${percent}%`));
  wrap.appendChild(head);
  // Two segments per the design system's meter: violet to the value, amber for
  // the shortfall. A neutral remainder would read as "no data" rather than
  // "this much is unresolved".
  const track = el("div", "bar-track");
  const fill = el("div", "bar-fill");
  fill.style.width = `${percent}%`;
  track.appendChild(fill);
  track.appendChild(el("div", "bar-remainder"));
  wrap.appendChild(track);
  wrap.appendChild(
    el("div", "receipt-caption", `${resolved} of ${total} citations resolve to a source file`),
  );
  return wrap;
}

/** Build the informational next-actions panel. */
function buildNextActions(model) {
  const panel = buildPanel("Next actions");
  panel.dataset.nextActions = "";
  const body = el("div", "panel-body");
  for (const [title, hint] of nextActionRows(model)) {
    const row = el("div", "action-row");
    row.appendChild(el("span", "action-title", title));
    row.appendChild(el("span", "action-hint", hint));
    body.appendChild(row);
  }
  panel.appendChild(body);
  return panel;
}

/** Only actions that currently apply; the export row always applies. */
// Three independent, non-nested guard conditions each appending one row
// inflate cyclomatic count for what stays a flat action list
// (cognitive complexity: 4).
// fallow-ignore-next-line complexity
function nextActionRows(model) {
  const rows = [];
  if (model.dangling > 0) {
    rows.push([`Resolve ${model.dangling} dangling links`, "create the pages or fix the targets"]);
  }
  if ((model.counts.stale ?? 0) > 0) {
    rows.push([`Recompile ${model.counts.stale} stale pages`, "llmwiki compile"]);
  }
  if (!model.lint) rows.push(["Run lint", "llmwiki lint"]);
  rows.push(["Export for agents", "llmwiki export"]);
  return rows;
}

/** Build the four-column explainer strip. */
function buildPatternStrip() {
  const strip = el("section", "pattern-strip");
  strip.appendChild(el("div", "panel-head", "The LLM Wiki pattern"));
  const grid = el("div", "pattern-grid");
  for (const [eyebrow, body] of PATTERN_COLUMNS) {
    const column = el("div", "pattern-column");
    column.appendChild(el("div", "pattern-eyebrow", eyebrow));
    column.appendChild(el("div", "pattern-body", body));
    grid.appendChild(column);
  }
  strip.appendChild(grid);
  return strip;
}

/** Build a titled panel shell. */
function buildPanel(title) {
  const panel = el("section", "panel");
  panel.appendChild(el("div", "panel-head", title));
  return panel;
}

/** Build a panel footer with a caption and a trailing link. */
function buildPanelFooter(caption, linkText, href) {
  const footer = el("div", "panel-footer");
  footer.appendChild(el("span", undefined, caption));
  const link = el("a", undefined, linkText);
  link.href = href;
  footer.appendChild(link);
  return footer;
}
