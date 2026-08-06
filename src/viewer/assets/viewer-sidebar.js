/**
 * llmwiki viewer — sidebar navigation.
 *
 * The Nebula sidebar is pure navigation: a project block, a BROWSE section,
 * a MAINTAIN section, and a docs card. The page tree and freshness filter
 * that used to live here now belong to the #/concepts list route, so the
 * sidebar stays a fixed height regardless of wiki size.
 *
 * Counts are advisory: every field of the render model is optional so first
 * paint can render the nav before /api/pages settles, and a failed
 * /api/health drops only the lint badge rather than blanking the nav.
 *
 * Entries whose surface does not exist in a read-only viewer (Settings,
 * Compile & export) are deliberately absent — see the design spec §2.3.
 */

import { el } from "./viewer-dom.js";
import { lintTotal } from "./viewer-format.js";

const SIDEBAR_SELECTOR = "[data-sidebar]";

/** Rendered when a count is present and zero. */
const EMPTY_COUNT = "—";

/** `profileId` the envelope reports when no profile is installed (server.ts). */
const DEFAULT_PROFILE_ID = "default";

/**
 * Nav entries per section. `count` names the `counts` key whose value is
 * shown; entries without one render no count. `route` doubles as the
 * `data-route` value `markActive` matches on.
 *
 * `zeroCountDisplay` sets what a zero count reads as, per section (mockup
 * tree lines 44/57): BROWSE has nothing to browse — an absence, shown as an
 * em dash; MAINTAIN's "zero pending reviews" is a meaningful, reassuring
 * fact rather than an absence, so it shows the literal digit instead.
 */
const NAV_SECTIONS = [
  {
    label: "BROWSE",
    zeroCountDisplay: "dash",
    items: [
      { route: "home", href: "#/", label: "Overview" },
      { route: "concepts", href: "#/concepts", label: "Concepts", count: "concepts" },
      { route: "sources", href: "#/sources", label: "Sources", count: "sourceFiles" },
      { route: "queries", href: "#/queries", label: "Queries", count: "queries" },
      { route: "graph", href: "#/graph", label: "Graph explorer" },
    ],
  },
  {
    label: "MAINTAIN",
    zeroCountDisplay: "digit",
    items: [
      { route: "health", href: "#/health", label: "Health & lint", badge: "lint" },
      { route: "reviews", href: "#/reviews", label: "Reviews", count: "pendingReviews" },
      // No count: workflow runs are not in the bootstrap envelope (they live
      // outside the frozen snapshot and #/workflows fetches them per visit),
      // so the sidebar has no number to show without a second startup request.
      //
      // `profileOnly`: workflows are declared BY a profile, so a default-profile
      // project cannot have one — not "has none yet", but cannot. Showing the
      // entry there would advertise a capability the project is structurally
      // incapable of, and `llmwiki template init` refuses to add a profile to a
      // project that already has pages, so the empty state would be permanent.
      // The profile-vocabulary design gates it the same way: its default
      // sidebar has no Pipeline row, only the two profile ones do.
      { route: "workflows", href: "#/workflows", label: "Workflows", profileOnly: true },
      // `profileOnly` for the same structural reason as Workflows: only a
      // profile declares entity types and lifecycles, so a default project has
      // no pipeline to draw — which is exactly what the design's default
      // sidebar shows, and why its two profile sidebars are the only ones with
      // a Pipeline row. The count is the number of entity types the profile
      // declares (see `navCounts`, viewer.js) — the number of rows the panel
      // will have, not a workload.
      { route: "pipeline", href: "#/pipeline", label: "Pipeline", count: "pipelineTypes", profileOnly: true },
    ],
  },
];

/**
 * Page routes mark their parent nav entry. `#/concepts/alpha` highlights
 * the Concepts entry rather than leaving the nav with nothing current.
 */
const PAGE_ROUTE_PARENTS = new Map([
  ["concepts", "concepts"],
  ["queries", "queries"],
]);

/** Hashes that resolve to the home route. */
const HOME_HASHES = new Set(["", "#", "#/"]);

/** Exact-hash to nav route mapping for the static routes. */
const STATIC_ROUTE_FOR_HASH = new Map([
  ["#/concepts", "concepts"],
  ["#/queries", "queries"],
  ["#/sources", "sources"],
  ["#/graph", "graph"],
  ["#/health", "health"],
  ["#/reviews", "reviews"],
  ["#/workflows", "workflows"],
  ["#/pipeline", "pipeline"],
  ["#/index", "home"],
]);

/**
 * Render the sidebar navigation.
 *
 * @param {{project?: {title?: string}, counts?: Record<string, number>,
 *          lint?: {warnings?: number, errors?: number} | null}} model
 */
export function renderSidebar(model) {
  const sidebar = document.querySelector(SIDEBAR_SELECTOR);
  if (!sidebar) return;
  sidebar.innerHTML = "";
  sidebar.appendChild(buildLockup());
  sidebar.appendChild(buildProjectBlock(model?.project));
  for (const section of NAV_SECTIONS) {
    sidebar.appendChild(buildNavSection(section, model));
  }
  sidebar.appendChild(buildFooterGroup());
  markActive();
}

/**
 * Build the product lockup: the 34px mark beside the product name and tagline.
 * The design system requires the mark never sit on a coloured plate, so this
 * renders directly on the sidebar surface with no background of its own.
 */
function buildLockup() {
  const wrap = el("div", "sidebar-lockup");
  const mark = document.createElement("img");
  mark.className = "sidebar-lockup-mark";
  mark.src = "/assets/llmwiki-logo-64.png";
  mark.width = 34;
  mark.height = 34;
  mark.alt = "";
  mark.setAttribute("aria-hidden", "true");
  wrap.appendChild(mark);
  const text = el("div", "sidebar-lockup-text");
  text.appendChild(el("div", "sidebar-lockup-name", "LLM Wiki Compiler"));
  text.appendChild(el("div", "sidebar-lockup-tagline", "compile once · reuse forever"));
  wrap.appendChild(text);
  return wrap;
}

/** Build the PROJECT block: name plus the local/read-only marker. */
function buildProjectBlock(project) {
  const wrap = el("div", "project-block");
  // PROJECT gets its own label class, not `.nav-section-label` — the
  // mockup gives it a different colour, margin, and no horizontal padding
  // compared to the BROWSE/MAINTAIN eyebrows (see viewer-chrome.css).
  wrap.appendChild(el("div", "project-label", "PROJECT"));
  const name = el("div", "project-name", project?.title || "llmwiki");
  name.dataset.projectName = "";
  wrap.appendChild(name);
  const status = el("div", "project-status");
  status.appendChild(el("span", "status-dot"));
  status.appendChild(el("span", undefined, "LOCAL · READ ONLY"));
  wrap.appendChild(status);
  return wrap;
}

/** Build one labelled nav section with the entries this project can actually use. */
function buildNavSection(section, model) {
  const wrap = el("section", "nav-section");
  wrap.appendChild(el("div", "nav-section-label", section.label));
  const list = el("ul", "nav-list");
  for (const item of section.items) {
    if (!isNavItemApplicable(item, model)) continue;
    list.appendChild(buildNavItem(item, section.zeroCountDisplay, model));
  }
  wrap.appendChild(list);
  return wrap;
}

/**
 * Whether an entry's surface can exist in THIS project.
 *
 * Only `profileOnly` entries can be inapplicable, and the test is deliberately
 * "can this project ever have one", not "does it have one now" — an empty
 * Reviews queue still earns its row because a candidate can appear at any time,
 * whereas a default-profile project can never declare a workflow.
 *
 * Absent `profileId` (first paint, before /api/pages settles) hides the entry
 * rather than showing one that may vanish a moment later: appearing late is
 * quieter than flickering away, and the nav is re-rendered once the envelope
 * lands.
 */
function isNavItemApplicable(item, model) {
  if (item.profileOnly !== true) return true;
  const profileId = model?.profileId;
  return typeof profileId === "string" && profileId !== DEFAULT_PROFILE_ID;
}

/** Build one nav `<li><a>` with its optional count or badge. */
function buildNavItem(item, zeroCountDisplay, model) {
  const li = el("li");
  const link = el("a", "nav-link");
  link.href = item.href;
  link.dataset.route = item.route;
  link.appendChild(el("span", "nav-label", item.label));
  appendNavMetric(link, item, zeroCountDisplay, model);
  li.appendChild(link);
  return li;
}

/** Append the count or lint badge to a nav link, when one applies. */
// Optional chaining in the two delegated lookups inflates cyclomatic count
// for what is a two-way dispatch (cognitive complexity: 2).
// fallow-ignore-next-line complexity
function appendNavMetric(link, item, zeroCountDisplay, model) {
  if (item.count) {
    appendNavCount(link, model?.counts?.[item.count], zeroCountDisplay);
    return;
  }
  if (item.badge === "lint") appendLintBadge(link, model?.lint);
}

/**
 * Append the count span, when the model actually carries a value for this
 * item. Zero-valued counts always get the `nav-count-zero` modifier, which
 * maps to `--fg-disabled` (viewer-chrome.css); the TEXT a zero renders as
 * depends on the section's `zeroCountDisplay` (see NAV_SECTIONS above) —
 * an em dash for BROWSE, the literal digit for MAINTAIN.
 */
function appendNavCount(link, value, zeroCountDisplay) {
  if (value === undefined) return;
  const isZero = !(value > 0);
  const className = isZero ? "nav-count nav-count-zero" : "nav-count";
  link.appendChild(el("span", className, navCountText(value, isZero, zeroCountDisplay)));
}

/** A zero's text is an em dash unless its section prefers the literal digit
 * (MAINTAIN); a non-zero count always renders as its number. */
function navCountText(value, isZero, zeroCountDisplay) {
  const zeroReadsAsDash = isZero && zeroCountDisplay !== "digit";
  return zeroReadsAsDash ? EMPTY_COUNT : String(value);
}

/** Append the lint badge, omitting it entirely when lint has never run (see lintTotal). */
function appendLintBadge(link, lint) {
  const total = lintTotal(lint);
  if (total === null) return;
  link.appendChild(el("span", "nav-badge", String(total)));
}

/**
 * Build the sidebar footer: a bottom-pinned column of standing cards
 * (mockup tree line 59). Only "Read the docs" ships — the mockup's
 * "Design system ↗" card links between design documents, not a product
 * surface, so it is deliberately absent (see the fidelity audit). The
 * group wrapper still exists on its own, matching the mockup's structure,
 * so a second card would space correctly if this ever grows one.
 */
function buildFooterGroup() {
  const group = el("div", "sidebar-footer");
  group.appendChild(buildDocsCard());
  return group;
}

/** The published documentation site. The repository README is a summary; this
 *  is the full reference the card's subtitle describes. */
const DOCS_URL = "https://llmwiki.atomicstrata.ai/introduction";

/** Build the standing "Read the docs" card pinned to the sidebar footer. */
function buildDocsCard() {
  const card = el("a", "docs-card");
  card.href = DOCS_URL;
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.appendChild(el("div", "docs-card-title", "Read the docs"));
  card.appendChild(el("div", "docs-card-body", "Profiles, lint rules, export formats."));
  return card;
}

/**
 * Mark the nav entry matching the current hash as `aria-current="page"`.
 * Exported so viewer.js can call it after route changes without
 * duplicating the hash-parsing rules.
 */
export function markActive() {
  const links = document.querySelectorAll(`${SIDEBAR_SELECTOR} a[data-route]`);
  for (const link of links) link.removeAttribute("aria-current");
  const active = activeRouteName(location.hash);
  if (!active) return;
  const match = document.querySelector(`${SIDEBAR_SELECTOR} a[data-route="${active}"]`);
  match?.setAttribute("aria-current", "page");
}

/** Resolve a hash to the nav route that should be marked current. */
function activeRouteName(hash) {
  const key = hash ?? "";
  if (HOME_HASHES.has(key)) return "home";
  const staticRoute = STATIC_ROUTE_FOR_HASH.get(key);
  if (staticRoute) return staticRoute;
  return pageRouteParent(key);
}

/** Resolve a `#/(concepts|queries)/<slug>` hash to its parent nav route, or null. */
function pageRouteParent(key) {
  const match = key.match(/^#\/(concepts|queries)\/.+$/);
  if (!match) return null;
  return PAGE_ROUTE_PARENTS.get(match[1]) ?? null;
}
