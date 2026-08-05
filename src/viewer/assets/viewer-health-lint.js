/**
 * llmwiki viewer — the health screen's Lint panel.
 *
 * The largest object on `#/health`: a head chipped with the combined problem
 * count, the error/warning figures beside a stacked proportion bar and its
 * legend, a row-per-rule table, and a footer naming the rule with the most
 * leverage. Everything here is projected from `lint.rules[]` — the per-rule
 * breakdown the linter persists into `.llmwiki/last-lint.json` — so the
 * whole panel degrades to the "run `llmwiki lint`" placeholder when that
 * cache has never been written (`lint === null` is a real, common state, not
 * an error).
 *
 * Split out of viewer-health.js rather than folded into it: the two together
 * would push a single module past the project's 400-line file budget
 * (CLAUDE.md), and the panel is a self-contained view over one payload
 * field.
 *
 * Read-only viewer: the mockup's per-row fix verbs ("create →", "map →") and
 * its "Resolve dangling links" button are mutations this snapshot has no
 * write path for. The FIX column navigates instead — to the most-affected
 * page when that file is one the viewer can route to — and the footer button
 * opens the graph explorer, where dangling targets already render as ghost
 * nodes.
 */

import { el, placeholder } from "./viewer-dom.js";
import { lintTotal, plural } from "./viewer-format.js";

/** Rendered in the FIX column when a rule's file is not a routable page. */
const NO_ROUTE = "—";

/**
 * Segment/swatch/rule colours cycle through four palette entries by rank,
 * so the bar segment, its legend swatch, and the table's rule name always
 * agree on one rule's colour. Four is the mockup's palette (danger, warn,
 * accent, ok); a fifth rule wraps rather than inventing a colour.
 */
const RANK_COLOURS = 4;

/** Path shape of a file the viewer can route to: `wiki/<dir>/<slug>.md`. */
const PAGE_FILE_PATTERN = /^wiki\/(concepts|queries)\/([^/]+)\.md$/;

/**
 * Build the Lint panel from the `/api/health` lint cache.
 *
 * @param {object|null} lint - The lint cache entry, or null when lint has
 *   never run.
 * @param {object} pageIndex - Routable pages, keyed `"<directory>/<slug>"`
 *   (see `routablePageIndex` in viewer-health.js) — used to decide whether a
 *   rule's most-affected file has a page route to link to.
 * @returns {HTMLElement}
 */
export function buildLintPanel(lint, pageIndex) {
  const total = lintTotal(lint);
  const panel = el("section", lintPanelClass(total));
  panel.dataset.lintPanel = "";
  panel.appendChild(buildLintHead(total));
  if (total === null) {
    panel.appendChild(placeholder("No cached lint summary yet — run `llmwiki lint`."));
    return panel;
  }
  const rules = rulesOf(lint);
  panel.appendChild(buildLintSummary(lint, rules));
  for (const row of buildRuleRows(rules, pageIndex)) panel.appendChild(row);
  appendFooter(panel, rules, total);
  return panel;
}

/**
 * The panel is warm-framed only while there is something to act on: a clean
 * run, and a wiki whose lint has never run, keep the neutral panel surface
 * so the warm tint stays a signal rather than a decoration.
 */
function lintPanelClass(total) {
  return `panel lint-panel${total > 0 ? " has-problems" : ""}`;
}

/** The persisted per-rule breakdown, or [] for a cache written before it existed. */
function rulesOf(lint) {
  return Array.isArray(lint.rules) ? lint.rules : [];
}

/** Build the panel head: the title, plus the problem chip once a run exists. */
function buildLintHead(total) {
  const head = el("div", "panel-head");
  const group = el("div", "lint-head-group");
  group.appendChild(el("span", "panel-title", "Lint"));
  if (total !== null) group.appendChild(el("span", "lint-chip", `${total} PROBLEMS`));
  head.appendChild(group);
  return head;
}

/** Build the body band: the two figures on the left, bar + legend on the right. */
function buildLintSummary(lint, rules) {
  const summary = el("div", "lint-summary");
  summary.appendChild(buildTotals(lint));
  const breakdown = el("div", "lint-breakdown");
  breakdown.appendChild(buildStackedBar(rules));
  breakdown.appendChild(buildLegend(rules));
  summary.appendChild(breakdown);
  return summary;
}

/** Build the stacked error/warning figures. */
function buildTotals(lint) {
  const totals = el("div", "lint-totals");
  totals.appendChild(buildFigure("errors", lint.errors ?? 0, "error"));
  totals.appendChild(buildFigure("warnings", lint.warnings ?? 0, "warning"));
  return totals;
}

/** Build one figure row: the count, then its noun pluralised against it. */
function buildFigure(key, count, noun) {
  const row = el("div", "lint-figure-row");
  row.appendChild(el("span", `lint-figure is-${key}`, String(count)));
  // plural() would repeat the count the figure beside it already carries;
  // only the noun's ending is wanted here.
  row.appendChild(el("span", "lint-figure-label", `${noun}${count === 1 ? "" : "s"}`));
  return row;
}

/**
 * Build the stacked proportion bar, one segment per rule. Widths are CSSOM
 * property writes rather than markup `style=` attributes, so the shell's
 * `style-src` needs no `'unsafe-inline'` (the same mechanism the dashboard's
 * citation meter uses).
 */
function buildStackedBar(rules) {
  const bar = el("div", "lint-bar");
  const total = totalOf(rules);
  if (total === 0) return bar;
  rules.forEach((rule, rank) => {
    const segment = el("div", "lint-bar-seg");
    segment.dataset.rank = String(rank % RANK_COLOURS);
    segment.style.width = `${(rule.count / total) * 100}%`;
    bar.appendChild(segment);
  });
  return bar;
}

/** Build the colour legend: a swatch and a "<rule> <count>" label per rule. */
function buildLegend(rules) {
  const legend = el("div", "lint-legend");
  rules.forEach((rule, rank) => {
    const item = el("span", "lint-legend-item");
    const swatch = el("span", "lint-swatch");
    swatch.dataset.rank = String(rank % RANK_COLOURS);
    item.appendChild(swatch);
    item.appendChild(el("span", undefined, `${rule.rule} ${rule.count}`));
    legend.appendChild(item);
  });
  return legend;
}

/** Sum every rule's finding count. */
function totalOf(rules) {
  return rules.reduce((sum, rule) => sum + (rule.count ?? 0), 0);
}

/** Build the table: a header row plus one row per rule, or nothing when clean. */
function buildRuleRows(rules, pageIndex) {
  if (rules.length === 0) return [];
  const rows = [buildHeadRow()];
  rules.forEach((rule, rank) => rows.push(buildRuleRow(rule, rank, pageIndex)));
  return rows;
}

/** Build the table's column-heading row. */
function buildHeadRow() {
  const row = el("div", "lint-row is-head");
  for (const label of ["RULE", "MOST AFFECTED", "COUNT", "FIX"]) {
    row.appendChild(el("span", undefined, label));
  }
  return row;
}

/** Build one rule row: name, most-affected summary, count, and the FIX cell. */
function buildRuleRow(rule, rank, pageIndex) {
  const row = el("div", "lint-row");
  row.dataset.rule = rule.rule;
  const name = el("span", "lint-rule", rule.rule);
  name.dataset.rank = String(rank % RANK_COLOURS);
  row.appendChild(name);
  row.appendChild(el("span", "lint-affected", mostAffectedText(rule)));
  row.appendChild(el("span", "lint-count", String(rule.count ?? 0)));
  row.appendChild(buildFixCell(rule.topFile, pageIndex));
  return row;
}

/**
 * Describe where a rule's findings land. One file carrying a strict majority
 * is worth naming; findings spread evenly are not — "7 files" says more than
 * an arbitrary one of the seven would.
 */
function mostAffectedText(rule) {
  const fileCount = rule.fileCount ?? 0;
  const name = pageNameOf(rule.topFile);
  // A rule confined to one file needs no share: the COUNT column beside it
  // already says how many findings that file holds.
  if (fileCount <= 1) return name;
  if (!hasDominantFile(rule)) return plural(fileCount, "file");
  return `${name} · ${rule.topFileCount} of ${rule.count}`;
}

/** True when one file carries a strict majority of a rule's findings. */
function hasDominantFile(rule) {
  return (rule.topFileCount ?? 0) * 2 > (rule.count ?? 0);
}

/** A file's display name: its basename with the Markdown extension dropped. */
function pageNameOf(file) {
  if (typeof file !== "string" || file.length === 0) return "—";
  return file.split("/").pop().replace(/\.md$/, "");
}

/**
 * Build the FIX cell. A link only when the flagged file resolves to a page
 * this viewer actually renders — infra rules (journal-health,
 * pending-embeddings) flag files that are not wiki pages, and a link to a
 * route that 404s is worse than no link.
 */
function buildFixCell(topFile, pageIndex) {
  const href = pageRouteFor(topFile, pageIndex);
  if (!href) return el("span", "lint-fix is-plain", NO_ROUTE);
  const link = el("a", "lint-fix", "view →");
  link.href = href;
  return link;
}

/** Resolve a lint finding's file to a `#/<dir>/<slug>` route, or null. */
function pageRouteFor(topFile, pageIndex) {
  if (typeof topFile !== "string") return null;
  const match = topFile.match(PAGE_FILE_PATTERN);
  if (!match) return null;
  const [, directory, slug] = match;
  if (!pageIndex.has(`${directory}/${slug}`)) return null;
  return `#/${directory}/${encodeURIComponent(slug)}`;
}

/**
 * Append the footer band naming the rule with the most leverage. "Dominant"
 * means the highest-count rule, which is `rules[0]` — the linter's cache
 * persists the breakdown already sorted by count descending. A clean run has
 * no such rule, so the band is omitted entirely rather than rendered empty.
 */
function appendFooter(panel, rules, total) {
  const dominant = rules[0];
  if (!dominant || total === 0) return;
  const footer = el("div", "lint-footer");
  const insight = `${dominant.count} of ${total} problems come from ${dominant.rule}.`;
  footer.appendChild(el("span", "lint-insight", insight));
  const action = el("a", "lint-action", "Open the graph explorer");
  action.href = "#/graph";
  footer.appendChild(action);
  panel.appendChild(footer);
}
