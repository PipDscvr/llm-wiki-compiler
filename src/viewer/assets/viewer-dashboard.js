/**
 * llmwiki viewer — Overview dashboard.
 *
 * Four stat cards, a hero banner, the recently-compiled list, a compact
 * knowledge graph, a compile receipt, and a next-actions list.
 *
 * The graph panel is a real render, not a decorative picture: `mountGraphPanel`
 * calls the same `loadGraph()` the full `#/graph` route uses, with
 * `{ compact: true }` — one fetch path and one simulation builder for both,
 * so the panel can never show structure the full explorer disagrees with. It
 * mounts after the synchronous DOM build below returns, and fire-and-forgets
 * its own failures so a slow or broken `/api/graph` never blocks the rest of
 * the dashboard from painting.
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
 *
 * A panel (`buildPanel`, `buildGraphPanel`) is a bordered shell with NO
 * padding of its own — a head band, a body, and (where the mockup shows
 * one) a footer band, each supplying its own padding/border. `buildPanel`
 * handles the common single-title-plus-optional-link head shape shared by
 * the recently-compiled panel and the rail's receipt/next-actions panels;
 * the graph panel's head differs enough (title+caption grouped left,
 * Fit/expand chips right) that it builds its own via `buildGraphPanelHead`.
 *
 * The dashboard renders into TWO places, not one: `main` gets the stat
 * grid, hero, recently-compiled/graph split, and pattern strip directly
 * (no wrapping `.dashboard-primary` div — `.dashboard` on `main` itself
 * *is* the primary column, matching the mockup's flex layout); the compile
 * receipt, next actions, and snapshot note go into the shared
 * `[data-support-rail]` via `renderDashboardRail` instead of a private
 * `.dashboard-rail` column. That keeps the dashboard to the mockup's two
 * content columns — see the fidelity audit's A2 note — rather than a
 * third column only the home route ever showed.
 */

import { el, emptyState } from "./viewer-dom.js";
import { isWarnFreshness, lintTotal, relativeAge } from "./viewer-format.js";
import { LEGEND_KINDS, loadGraph, staleIdsFromEnvelope } from "./viewer-graph.js";
import { renderDashboardRail } from "./viewer-rail.js";

/**
 * Stat card definitions: key, label, badge, and value/sub-line derivations.
 *
 * `badge` is a fixed category noun (mockup tree lines 108/118/128) — true
 * regardless of the card's count, like "PAGES" or "INPUT" — except
 * `badgeWhenCalm` on "reviews": the mockup's "CLEAR" (tree line 139) only
 * reads correctly when the queue actually is empty, so it replaces the
 * fixed "QUEUE" label just for that state rather than being hardcoded
 * unconditionally (which would misread as "CLEAR" beside a non-zero
 * candidate count).
 */
const STAT_CARDS = [
  {
    key: "concepts",
    label: "Concepts",
    badge: "PAGES",
    value: (m) => m.counts.concepts ?? 0,
    // Scoped to concept pages only (not envelope-wide totalCitations/pageCount,
    // which also include queries) — the card is named "Concepts", so its
    // sub-line must describe concepts, not the whole envelope.
    sub: (m) => `${m.conceptsCitations} citations · ${m.counts.concepts ?? 0} pages`,
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
    badge: "LINT",
    warnWhenNonZero: true,
    value: (m) => m.attention,
    sub: (m) => `${m.dangling} dangling · ${m.unresolved} unresolved citations`,
  },
  {
    key: "reviews",
    label: "Awaiting review",
    badge: "QUEUE",
    badgeWhenCalm: "CLEAR",
    warnWhenNonZero: true,
    calmWhenZero: true,
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
  main.appendChild(buildStatGrid(model));
  main.appendChild(buildHero(model));
  main.appendChild(buildSplit(model));
  main.appendChild(buildPatternStrip());
  renderDashboardRail([buildReceipt(model), buildNextActions(model), buildSnapshotNote()]);
  void mountGraphPanel(main, envelope);
}

/**
 * Render the compact graph into the reserved panel surface. Fire-and-forget:
 * a graph that fails to load leaves its own error banner inside the panel and
 * must not prevent the rest of the dashboard from rendering.
 */
async function mountGraphPanel(main, envelope) {
  const surface = main.querySelector("[data-graph-panel]");
  if (!surface) return;
  try {
    await loadGraph(surface, { compact: true, staleIds: staleIdsFromEnvelope(envelope) });
  } catch {
    // loadGraph renders its own inline failure state.
  }
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
    // Concepts-only citation total for the "Concepts" stat card's sub-line —
    // totalCitations above is envelope-wide (concepts + queries) and would
    // mislabel a query's citations as belonging to the concepts card.
    conceptsCitations: citationsInDirectory(pages, "concepts"),
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

/** Sum citationCount over the pages in one pageDirectory (e.g. "concepts"). */
function citationsInDirectory(pages, directory) {
  const inDirectory = pages.filter((p) => p.pageDirectory === directory);
  return sumBy(inDirectory, (p) => p.citationCount ?? 0);
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

/** True when a card's warnWhenNonZero flag is set and its value has something to report. */
function isCardWarn(card, value) {
  return card.warnWhenNonZero === true && value > 0;
}

/** True when a card's calmWhenZero flag is set and its value is clear. */
function isCardCalm(card, value) {
  return card.calmWhenZero === true && value === 0;
}

/**
 * Resolve a card's state from its value: "warn" and "calm" are mutually
 * exclusive (see STAT_CARDS' comment and the CSS rules' own comments in
 * viewer-dashboard.css); anything else is "neutral" (concepts, sources,
 * and any signal card that opted into neither flag).
 *
 * @param {object} card - A STAT_CARDS entry.
 * @param {number} value - That card's computed value.
 * @returns {"warn"|"calm"|"neutral"}
 */
function statCardState(card, value) {
  if (isCardWarn(card, value)) return "warn";
  if (isCardCalm(card, value)) return "calm";
  return "neutral";
}

/** Resolve a card's badge text for its current state (see badgeWhenCalm's own comment). */
function statCardBadgeText(card, state) {
  return state === "calm" && card.badgeWhenCalm ? card.badgeWhenCalm : card.badge;
}

/** Build one stat card. */
function buildStatCard(card, model) {
  const value = card.value(model);
  const state = statCardState(card, value);
  const wrap = el("div", `stat-card${state === "neutral" ? "" : ` is-${state}`}`);
  wrap.dataset.stat = card.key;
  const head = el("div", "stat-head");
  head.appendChild(el("span", "stat-label", card.label));
  head.appendChild(el("span", "stat-badge", statCardBadgeText(card, state)));
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

/**
 * Build the recently-compiled panel. The head's "View all" (mockup tree
 * line 161) and the footer's "All N concepts →" (tree line 223) both point
 * at #/concepts — two affordances to the same place, matching the mockup's
 * own duplication rather than dropping one as redundant.
 */
function buildRecentPanel(model) {
  const panel = buildPanel("Recently compiled", buildTrailingLink("View all", "#/concepts"));
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
  // The mockup's footer caption ("cited / total claims per page", tree line
  // 221) describes the per-row claims ratio this build omits (no claims
  // inventory to back it — see file header); this caption instead describes
  // what the row actually shows. The "N concepts" count is real data,
  // already computed for the hero/stat cards above, not a mockup literal.
  panel.appendChild(
    buildPanelFooter(
      "cited pages, most recent first",
      buildTrailingLink(`All ${model.counts.concepts ?? 0} concepts →`, "#/concepts"),
    ),
  );
  return panel;
}

/** Build one recently-compiled row. */
// Optional chaining, a predicate call, and a title fallback inflate
// cyclomatic count for what stays a single flat row builder
// (cognitive complexity: 3).
// fallow-ignore-next-line complexity
function buildRecentRow(page, freshness) {
  const row = el("div", "recent-row");
  const status = freshness?.freshnessStatus ?? "unverified";
  // Same rule as the #/concepts and #/queries list rows (viewer-lists.js) —
  // only stale/orphaned warn. This dot and that one share the .list-dot
  // class and must never disagree about what a given status means.
  const dot = el("span", `list-dot ${isWarnFreshness(status) ? "is-warn" : "is-ok"}`);
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
 * Build the graph panel shell: a head with the title/edge-count grouped on
 * the left and view-control chips on the right, the four-item legend, the
 * `[data-graph-panel]` surface `mountGraphPanel` renders the compact graph
 * into, and a footer. Unlike `buildRecentPanel`, this panel does not reuse
 * `buildPanel()`'s single-title head — the mockup's head shape here is
 * different (title + caption grouped left, two chips right; tree lines
 * 225-235), so it is built directly.
 */
function buildGraphPanel(model) {
  const panel = el("section", "panel graph-panel");
  panel.appendChild(buildGraphPanelHead(model));
  panel.appendChild(buildGraphLegend());
  const surface = el("div", "graph-panel-surface");
  surface.dataset.graphPanel = "";
  panel.appendChild(surface);
  panel.appendChild(buildPanelFooter("hover a node to inspect", buildDanglingNote(model.graph)));
  return panel;
}

/**
 * Build the graph panel's head. "Fit" and "⤢" (tree lines 232-235) are
 * rendered as inert visual chips, not wired to real zoom/fullscreen
 * behaviour: the mockup captures no title/onClick on either (the tree
 * labels interactive icons that way — see the theme toggle), and adding a
 * real fit-to-view action would mean exposing zoom control out of
 * viewer-graph.js's `loadGraph`, a feature addition beyond this pass's
 * pixel-fidelity scope.
 */
function buildGraphPanelHead(model) {
  const head = el("div", "panel-head");
  const left = el("div", "panel-head-group");
  left.appendChild(el("span", "panel-title", "Knowledge graph"));
  left.appendChild(
    el("span", "panel-caption", `${model.graph.nodeCount} nodes · ${model.graph.edgeCount} edges`),
  );
  head.appendChild(left);
  const controls = el("div", "panel-controls");
  controls.appendChild(el("span", "panel-chip", "Fit"));
  controls.appendChild(el("span", "panel-chip", "⤢"));
  head.appendChild(controls);
  return head;
}

/**
 * Build the graph footer's trailing dangling-count note. Only tinted
 * --danger when non-zero (mockup tree line 258) — a zero count is good
 * news, not a warning, the same rule the stat cards' counter tiles use.
 * The mockup's left-hand "focus · Andrej Karpathy" (tree lines 254-257)
 * names whichever node is currently hovered; reproducing that would mean
 * wiring this footer to viewer-graph.js's hover state, so the footer's
 * caption instead names the real, always-available interaction (see
 * buildGraphPanel's "hover a node to inspect").
 */
function buildDanglingNote(graph) {
  const className = graph.danglingCount > 0 ? "footer-danger" : undefined;
  return el("span", className, `${graph.danglingCount} dangling targets`);
}

/**
 * Build the panel's own compact legend row (concept / entity / stale /
 * dangling — spec §5.3). `viewer-graph.js` suppresses its own overlay
 * legend in compact mode specifically because this panel renders one
 * instead (see its `loadGraph` JSDoc); without this row the panel would
 * show four colours of node with no key, making colour the only signal —
 * exactly what spec §6 requires the viewer to avoid.
 *
 * Reuses `LEGEND_KINDS` (the shared four-semantic list `nodeClass()` in
 * viewer-graph.js resolves against) and the `.graph-legend-dot--*` swatch
 * classes already styled in viewer-graph.css for the full explorer's own
 * legend, so this row can never drift into a second, disagreeing palette.
 * The trailing "size = degree" note (mockup tree line 249) is static —
 * always true, not derived from the model.
 */
function buildGraphLegend() {
  const row = el("div", "panel-legend");
  for (const { label, kind } of LEGEND_KINDS) {
    const item = el("div", "graph-legend-item");
    item.appendChild(el("div", `graph-legend-dot graph-legend-dot--${kind}`));
    item.appendChild(el("span", undefined, label));
    row.appendChild(item);
  }
  row.appendChild(el("span", "panel-legend-note", "size = degree"));
  return row;
}

/** Build the rail's closing note: the viewer is a frozen, not live, snapshot. */
function buildSnapshotNote() {
  const note = el("div", "snapshot-note");
  note.appendChild(
    el("span", undefined,
      "The viewer serves a frozen snapshot. Changes on disk appear after llmwiki view restarts."),
  );
  return note;
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

/**
 * Build the four-column explainer strip. The head's caption ("shown until
 * you dismiss it", mockup tree line 266) is rendered as static text only —
 * the mockup carries no visible dismiss control in the DOM to wire up, so
 * this stops short of adding real dismiss/persistence behaviour.
 */
function buildPatternStrip() {
  const strip = el("section", "pattern-strip");
  strip.appendChild(buildPatternHead());
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

/** Build the pattern strip's head band: title + a small static caption. */
function buildPatternHead() {
  const head = el("div", "pattern-head");
  head.appendChild(el("span", "pattern-title", "The LLM Wiki pattern"));
  head.appendChild(el("span", "pattern-head-caption", "shown until you dismiss it"));
  return head;
}

/**
 * Build a titled panel shell: a bordered container plus a head band
 * (title, and an optional trailing node such as a "View all" link).
 * Shared by the recently-compiled panel and the rail's compile-receipt /
 * next-actions panels — the graph panel's head shape differs too much to
 * reuse this (see buildGraphPanelHead).
 */
function buildPanel(title, trailing) {
  const panel = el("section", "panel");
  const head = el("div", "panel-head");
  head.appendChild(el("span", "panel-title", title));
  if (trailing) head.appendChild(trailing);
  panel.appendChild(head);
  return panel;
}

/** Build a panel footer band: a caption on the left, a trailing node on the right. */
function buildPanelFooter(caption, trailing) {
  const footer = el("div", "panel-footer");
  footer.appendChild(el("span", undefined, caption));
  footer.appendChild(trailing);
  return footer;
}

/** Build a trailing `<a>` link, shared by a panel head's link and a panel footer's link. */
function buildTrailingLink(text, href) {
  const link = el("a", undefined, text);
  link.href = href;
  return link;
}
