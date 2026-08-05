/**
 * llmwiki viewer — the `#/health` route's view.
 *
 * Nebula's health screen answers one question in order: is anything wrong,
 * what is it, and where. So the page reads top to bottom as a head carrying
 * the whole-wiki verdict, a CONTENTS strip of inert counts (deliberately one
 * divided panel, not five cards — five equal tiles gave a zero the same
 * weight as a real figure), then a two-column grid whose wide left side is
 * the Lint panel and whose right side stacks Freshness, Traceability, and
 * the cache note.
 *
 * Both bootstrap payloads are needed: `/api/health` carries the counts and
 * the lint cache; `/api/pages` carries per-page freshness and the citation
 * totals. Either can be absent — every accessor here defaults rather than
 * assuming a field is present.
 *
 * The verdict pill lives on this page rather than in the persistent header:
 * the header is shared with every other route and was pixel-matched to a
 * different design file whose pill reports freshness alone. Restyling it to
 * carry a whole-wiki verdict would have changed what the Overview says about
 * itself; this page states its own verdict instead.
 *
 * The Lint panel is in viewer-health-lint.js — see that module's header.
 */

import { el } from "./viewer-dom.js";
import {
  formatUtcTimestamp,
  freshnessBadgeText,
  plural,
  relativeSince,
} from "./viewer-format.js";
import { buildLintPanel } from "./viewer-health-lint.js";

/** Rendered in place of a bold 0: an empty count is an absence, not news. */
const EMPTY_COUNT = "—";

/** Freshness statuses, in the order their bars are coloured by CSS modifier. */
const FRESHNESS_STATUSES = new Set(["fresh", "stale", "orphaned"]);

/**
 * The CONTENTS strip's five columns. `figure` returns the big number and
 * `suffix` the small mono phrase beside it, both reading a single `model`
 * assembled once by `buildContentsModel` so no accessor has to re-derive a
 * total or guard a null payload a second time.
 */
const CONTENTS_COLUMNS = [
  {
    key: "concepts",
    label: "Concepts",
    figure: (m) => m.concepts,
    suffix: () => "pages",
  },
  {
    key: "sources",
    label: "Sources",
    figure: (m) => m.sourceFiles,
    suffix: (m) => `${m.sources} compiled`,
  },
  {
    key: "citations",
    label: "Citations",
    figure: (m) => m.totalCitations,
    suffix: (m) => `${m.citedCitations} cited`,
  },
  {
    key: "queries",
    label: "Saved queries",
    figure: (m) => m.queries,
    suffix: (m) => (m.queries === 0 ? "none yet" : "answers"),
  },
  {
    key: "reviews",
    label: "Awaiting review",
    figure: (m) => m.pendingReviews,
    suffix: (m) => (m.pendingReviews === 0 ? "queue clear" : "candidates"),
  },
];

/**
 * Build the whole health view.
 *
 * @param {object|null} health - The `/api/health` payload.
 * @param {object|null} envelope - The `/api/pages` envelope.
 * @returns {HTMLElement}
 */
export function buildHealthView(health, envelope) {
  const model = buildContentsModel(health, envelope);
  const view = el("section", "health-view");
  view.appendChild(buildHead(health, model));
  view.appendChild(buildContentsStrip(model));
  const grid = el("div", "health-grid");
  grid.appendChild(buildLintPanel(health?.lint ?? null, routablePageIndex(envelope)));
  grid.appendChild(buildRightColumn(model));
  view.appendChild(grid);
  return view;
}

/**
 * Count fields `/api/health` carries, each defaulting to 0. `stale` and
 * `orphaned` are whole-wiki counts straight from the snapshot: the verdict
 * pill speaks for every page, including any the Freshness panel does not
 * draw a bar for, and must still warn if `/api/pages` never arrived.
 */
const HEALTH_COUNT_KEYS = [
  "concepts",
  "queries",
  "sources",
  "sourceFiles",
  "pendingReviews",
  "stale",
  "orphaned",
];

/**
 * Project both payloads into the one flat model every section below reads.
 * Citation totals are summed here rather than per-consumer so the CONTENTS
 * strip and the Traceability meter can never disagree about them.
 */
function buildContentsModel(health, envelope) {
  const pages = pagesOf(envelope);
  const conceptPages = pages.filter((page) => page.pageDirectory === "concepts");
  const citations = citationTotals(pages);
  return {
    ...healthCounts(health),
    errors: lintErrors(health),
    totalCitations: citations.total,
    citedCitations: citations.total - citations.unresolved,
    unresolved: citations.unresolved,
    conceptPages,
    // Concept-page counts, derived from the same rows the bars are drawn
    // from, so the Freshness panel's bars, badge, and sentence cannot
    // contradict each other the way two independent sources would.
    stalePages: countStatus(conceptPages, "stale"),
    orphanedPages: countStatus(conceptPages, "orphaned"),
    // Pages whose freshness could not be computed at all (missing or corrupt
    // state.json). Counted separately because "not stale" and "we cannot
    // tell" are different facts, and the panel must not report the second as
    // the first.
    unverifiedPages: conceptPages.length - countVerified(conceptPages),
  };
}

/** Count the pages whose freshness status is one the compiler actually resolved. */
function countVerified(pages) {
  return pages.filter((page) => FRESHNESS_STATUSES.has(page.freshness?.freshnessStatus)).length;
}

/** The envelope's page rows, or [] when `/api/pages` never arrived. */
function pagesOf(envelope) {
  return Array.isArray(envelope?.pages) ? envelope.pages : [];
}

/** Lint's error count, or 0 when lint has never run. */
function lintErrors(health) {
  return health?.lint?.errors ?? 0;
}

/** Citation counts summed across every page, cited and uncited together. */
function citationTotals(pages) {
  return {
    total: sumBy(pages, (page) => page.citationCount ?? 0),
    unresolved: sumBy(pages, (page) => page.unresolvedCitationCount ?? 0),
  };
}

/** Read every HEALTH_COUNT_KEYS field off a possibly-absent payload. */
function healthCounts(health) {
  const counts = {};
  for (const key of HEALTH_COUNT_KEYS) counts[key] = health?.[key] ?? 0;
  return counts;
}

/** Count the pages carrying one freshness status. */
function countStatus(pages, status) {
  return pages.filter((page) => page.freshness?.freshnessStatus === status).length;
}

/** Sum a numeric projection over a list. */
function sumBy(items, project) {
  return items.reduce((total, item) => total + project(item), 0);
}

/** Index the envelope's pages by `"<directory>/<slug>"` for route lookups. */
function routablePageIndex(envelope) {
  return new Set(pagesOf(envelope).map((page) => `${page.pageDirectory}/${page.slug}`));
}

/** Build the page head: the title and verdict pill, then the lint-run caption. */
function buildHead(health, model) {
  const head = el("div", "health-head");
  const group = el("div", "health-head-group");
  group.appendChild(el("h1", "health-title", "Health"));
  group.appendChild(buildVerdictPill(model));
  head.appendChild(group);
  head.appendChild(el("span", "health-lint-run", lintRunCaption(health?.lint ?? null)));
  return head;
}

/**
 * True when anything on the wiki is actionable. Warnings alone do not
 * qualify: they are advisory, and a verdict that warns at every warning
 * stops meaning anything.
 */
function needsAttention(model) {
  return model.errors > 0 || model.stale > 0 || model.orphaned > 0;
}

/** Build the whole-wiki verdict pill (see {@link needsAttention}). */
function buildVerdictPill(model) {
  const warn = needsAttention(model);
  const pill = el(
    "span",
    `freshness-pill ${warn ? "is-warn" : "is-ok"}`,
    warn ? "NEEDS ATTENTION" : "ALL CLEAR",
  );
  pill.dataset.verdict = "";
  return pill;
}

/** Compose the "lint last run <ts> · <relative> ago" caption. */
function lintRunCaption(lint) {
  if (!lint) return "lint has never run";
  const stamp = `${formatUtcTimestamp(lint.at)}Z`;
  const since = relativeSince(lint.at);
  return since ? `lint last run ${stamp} · ${since} ago` : `lint last run ${stamp}`;
}

/** Build the CONTENTS strip: a head band above five rule-divided columns. */
function buildContentsStrip(model) {
  const strip = el("div", "contents-strip");
  const head = el("div", "contents-head");
  head.appendChild(el("span", "contents-eyebrow", "CONTENTS"));
  head.appendChild(el("span", "contents-caption", "counts only — nothing here is a problem"));
  strip.appendChild(head);
  const columns = el("div", "contents-columns");
  for (const column of CONTENTS_COLUMNS) columns.appendChild(buildContentsCell(column, model));
  strip.appendChild(columns);
  return strip;
}

/** Build one CONTENTS column: a label, then the figure and its mono suffix. */
function buildContentsCell(column, model) {
  const cell = el("div", "contents-cell");
  cell.dataset.contents = column.key;
  cell.appendChild(el("div", "contents-label", column.label));
  const figure = el("div", "contents-figure");
  const value = column.figure(model);
  const isZero = !(value > 0);
  figure.appendChild(
    el("span", `contents-value${isZero ? " is-zero" : ""}`, isZero ? EMPTY_COUNT : String(value)),
  );
  figure.appendChild(el("span", "contents-suffix", column.suffix(model)));
  cell.appendChild(figure);
  return cell;
}

/** Build the right-hand column: Freshness, Traceability, then the cache note. */
function buildRightColumn(model) {
  const column = el("div", "health-column");
  column.appendChild(buildFreshnessPanel(model));
  column.appendChild(buildTraceabilityPanel(model));
  column.appendChild(buildCacheNote());
  return column;
}

/** Build the Freshness panel: a status badge, one bar per page, then a sentence. */
function buildFreshnessPanel(model) {
  const panel = el("section", "panel");
  panel.dataset.freshnessPanel = "";
  const head = el("div", "panel-head");
  head.appendChild(el("span", "panel-title", "Freshness"));
  head.appendChild(buildFreshnessBadge(model));
  panel.appendChild(head);
  const body = el("div", "panel-body");
  body.appendChild(buildFreshnessBars(model.conceptPages));
  body.appendChild(el("div", "freshness-note", freshnessNote(model)));
  panel.appendChild(body);
  return panel;
}

/**
 * Badge the two actionable freshness counts. A wiki whose freshness could
 * not be computed at all gets neither the calm nor the warning treatment —
 * IN SYNC would assert something the state file cannot back up.
 */
function buildFreshnessBadge(model) {
  if (isWhollyUnverified(model)) return el("span", "freshness-pill is-unknown", "UNVERIFIED");
  const warn = model.stalePages > 0 || model.orphanedPages > 0;
  const text = freshnessBadgeText(model.stalePages, model.orphanedPages, "IN SYNC");
  return el("span", `freshness-pill ${warn ? "is-warn" : "is-ok"}`, text);
}

/** True when there are pages but not one of them has a resolved freshness status. */
function isWhollyUnverified(model) {
  const total = model.conceptPages.length;
  return total > 0 && model.unverifiedPages === total;
}

/**
 * Build one bar per concept page, coloured by that page's own status. Very
 * large wikis compress the bars — the row's fixed 4px gaps do not shrink —
 * which reads as "many pages" rather than breaking; the sentence below
 * always carries the exact counts regardless.
 */
function buildFreshnessBars(conceptPages) {
  const bars = el("div", "freshness-bars");
  for (const page of conceptPages) {
    const status = page.freshness?.freshnessStatus;
    const known = FRESHNESS_STATUSES.has(status) ? status : "unverified";
    bars.appendChild(el("div", `freshness-bar is-${known}`));
  }
  return bars;
}

/**
 * Compose the Freshness panel's sentence. Ordered by what the reader most
 * needs to know: real problems first, then the fact that freshness could not
 * be computed, and only then the all-clear — which is the one sentence that
 * would be a lie if either of the earlier cases applied.
 */
function freshnessNote(model) {
  const total = model.conceptPages.length;
  if (total === 0) return "No concept pages yet.";
  if (model.stalePages + model.orphanedPages > 0) {
    const stale = plural(model.stalePages, "page");
    const orphaned = plural(model.orphanedPages, "page");
    return `${stale} stale and ${orphaned} orphaned out of ${total}.`;
  }
  if (model.unverifiedPages > 0) return unverifiedNote(model, total);
  return "Every page is newer than its sources. Nothing stale, nothing orphaned.";
}

/** Say how much of the wiki's freshness could not be checked, and why. */
function unverifiedNote(model, total) {
  const scope =
    model.unverifiedPages === total
      ? "Freshness could not be checked for any page"
      : `Freshness could not be checked for ${plural(model.unverifiedPages, "page")}`;
  return `${scope} — state.json is missing or unreadable. Run \`llmwiki compile\` to restore it.`;
}

/**
 * Build the Traceability panel. The mockup measures "claims cited", but the
 * compiler maintains no claims inventory; citation resolution is the
 * equivalent fact that IS tracked (design spec §5.3), so the panel counts
 * citations that resolve to a real source span.
 */
function buildTraceabilityPanel(model) {
  const panel = el("section", "panel trace-meter");
  panel.dataset.traceabilityPanel = "";
  const head = el("div", "panel-head");
  head.appendChild(el("span", "panel-title", "Traceability"));
  panel.appendChild(head);
  const body = el("div", "panel-body");
  body.appendChild(buildTraceHead(model));
  body.appendChild(buildTraceBar(model));
  body.appendChild(el("div", "trace-note", traceNote(model)));
  panel.appendChild(body);
  return panel;
}

/** Build the big percentage beside its "n / m citations" figure. */
function buildTraceHead(model) {
  const head = el("div", "trace-head");
  head.appendChild(el("span", "trace-value", `${citedPercent(model)}%`));
  head.appendChild(
    el("span", "trace-detail", `${model.citedCitations} / ${model.totalCitations} citations`),
  );
  return head;
}

/**
 * Share of citations that resolve, as a whole percent. A wiki with no
 * citations at all is fully traced by definition — reporting 0% would call
 * an empty wiki a failure.
 */
function citedPercent(model) {
  if (model.totalCitations === 0) return 100;
  return Math.round((model.citedCitations / model.totalCitations) * 100);
}

/**
 * Build the two-segment cited/uncited bar, reusing the design system's
 * meter track (viewer-dashboard.css). The width is a CSSOM property write,
 * not a markup `style=` attribute, so `style-src` needs no relaxation.
 */
function buildTraceBar(model) {
  const track = el("div", "bar-track");
  const fill = el("div", "bar-fill");
  fill.style.width = `${citedPercent(model)}%`;
  track.appendChild(fill);
  track.appendChild(el("div", "bar-remainder"));
  return track;
}

/** Compose the Traceability panel's sentence for each of its three states. */
function traceNote(model) {
  if (model.totalCitations === 0) return "No citations recorded yet.";
  if (model.unresolved === 0) return "Every citation resolves to a real source span.";
  const noun = model.unresolved === 1 ? "citation still points" : "citations still point";
  return `${model.unresolved} ${noun} at no source file — the rest resolve to a real span.`;
}

/** Build the dim note explaining that lint figures come from a cache. */
function buildCacheNote() {
  const note = el("div", "cache-note");
  note.appendChild(el("span", undefined, "Lint results are cached from the last run. Re-run "));
  note.appendChild(el("code", undefined, "llmwiki lint"));
  note.appendChild(el("span", undefined, " and restart the viewer to refresh."));
  return note;
}
