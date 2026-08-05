/**
 * llmwiki viewer — vanilla-JS client.
 *
 * Three responsibilities, kept deliberately small:
 *   1. First paint renders the sidebar nav from an empty model
 *      (`renderSidebar({})`) so the chrome appears before any fetch settles.
 *   2. `/api/pages` and `/api/health`, fetched once in parallel via
 *      `loadBootstrapData()` and cached in `bootstrapData` — fill in the
 *      sidebar's counts and lint badge, and render the dashboard home.
 *   3. Hash router (`#/`, `#/concepts/<slug>`, `#/queries/<slug>`,
 *      `#/index`, `#/health`) that fetches `/api/page/...`,
 *      `/api/index`, or `/api/health` and drops the result into the
 *      main pane. The server returns already-sanitized HTML in `html`
 *      (see `src/viewer/render.ts`), so the client only has to set
 *      `innerHTML` and link up the support rail.
 *
 * No external dependencies, no client-side markdown rendering, no
 * inline event handlers — the spec's CSP only allows scripts from
 * `'self'`. The search-input wiring lives in `viewer-search.js`.
 */

import { definitionList, heading, placeholder } from "./viewer-dom.js";
import { wireThemeToggle } from "./viewer-theme.js";
import { wireSearch } from "./viewer-search.js";
import { renderSidebar, markActive } from "./viewer-sidebar.js";
import { renderProjectRail, renderSupportRail, clearSupportRail } from "./viewer-rail.js";
import { loadGraph } from "./viewer-graph.js";
import { renderHeader } from "./viewer-header.js";
import { renderConceptsList, renderQueriesList, renderSourcesList } from "./viewer-lists.js";
import { renderDashboard } from "./viewer-dashboard.js";

const MAIN_SELECTOR = "[data-main-pane]";

/** Hashes that all map to the home route — `#`, `#/`, and empty/missing. */
const HOME_HASHES = new Set(["", "#", "#/"]);

/** Static routes whose hash uniquely names the kind (no slug segment). */
const STATIC_ROUTES = new Map([
  ["#/index", { kind: "index" }],
  ["#/health", { kind: "health" }],
  ["#/graph", { kind: "graph" }],
  ["#/concepts", { kind: "concepts" }],
  ["#/queries", { kind: "queries" }],
  ["#/sources", { kind: "sources" }],
]);

/** Pattern matching `#/(concepts|queries)/<slug>` hash routes. */
const PAGE_HASH_PATTERN = /^#\/(concepts|queries)\/(.+)$/;

/** Rows for the /api/health metrics block: `[label, health key]`. */
const HEALTH_METRIC_ROWS = [
  ["Concepts", "concepts"],
  ["Saved queries", "queries"],
  ["Compiled sources", "sources"],
  ["Source files", "sourceFiles"],
  ["Stale pages", "stale"],
  ["Orphaned pages", "orphaned"],
  ["Pending reviews", "pendingReviews"],
];

/** Rows for the lint block: `[label, key, fallback]`. */
const LINT_METRIC_ROWS = [
  ["Warnings", "warnings", 0],
  ["Errors", "errors", 0],
  ["Last run", "at", ""],
];

/**
 * Bootstrap payloads shared by the sidebar, dashboard, and health route.
 * Fetched once in parallel at startup; each entry stays null if its fetch
 * failed, so one failing endpoint degrades only the surfaces that need it.
 */
const bootstrapData = { pages: null, health: null };

/** Fetch both bootstrap endpoints in parallel, tolerating either failing. */
async function loadBootstrapData() {
  const [pages, health] = await Promise.all([
    fetchJson("/api/pages").catch(() => null),
    fetchJson("/api/health").catch(() => null),
  ]);
  bootstrapData.pages = pages;
  bootstrapData.health = health;
  return bootstrapData;
}

/**
 * Parse `location.hash` into a route descriptor. Static routes resolve
 * via `STATIC_ROUTES`; page routes fall through to {@link parsePageRoute}.
 * Malformed percent-encoding in the slug segment falls back to the home
 * route so a hand-edited URL cannot throw from `decodeURIComponent`
 * (`#/concepts/%E0%A4%A` is the canonical bad-input case).
 */
function parseRoute(hash) {
  const key = hash ?? "";
  if (HOME_HASHES.has(key)) return { kind: "home" };
  const staticRoute = STATIC_ROUTES.get(key);
  if (staticRoute) return staticRoute;
  return parsePageRoute(key);
}

/** Resolve a `#/(concepts|queries)/<slug>` hash; non-matches return home. */
function parsePageRoute(hash) {
  const match = hash.match(PAGE_HASH_PATTERN);
  if (!match) return { kind: "home" };
  const slug = decodeSlug(match[2]);
  if (slug === null) return { kind: "home" };
  return { kind: "page", directory: match[1], slug };
}

/** Safely percent-decode a slug; returns null on malformed input. */
function decodeSlug(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** Dispatch table: route.kind → handler for routes that fit the (main) signature. */
const ROUTE_RENDERERS = {
  home: () => loadAndRenderHome(),
  index: (main) => renderIndexPane(main),
  health: (main) => renderHealthPane(main),
  graph: (main) => renderGraphPane(main),
  concepts: (main) => renderListRoute(main, renderConceptsList),
  queries: (main) => renderListRoute(main, renderQueriesList),
  sources: (main) => renderListRoute(main, renderSourcesList),
};

/** Render a list route from the cached envelope, fetching only if absent. */
async function renderListRoute(main, render) {
  clearSupportRail();
  const envelope = bootstrapData.pages ?? (await loadBootstrapData()).pages;
  if (!envelope) {
    renderError("Could not load /api/pages");
    return;
  }
  render(main, envelope);
}

/** Fetch and render the page at the current hash route. */
async function renderRoute() {
  const route = parseRoute(location.hash);
  markActive();
  const main = document.querySelector(MAIN_SELECTOR);
  if (!main) return;
  main.className = "main-pane";
  const handler = ROUTE_RENDERERS[route.kind];
  if (handler) return handler(main);
  return renderPagePane(main, route.directory, route.slug);
}

/** Render the health pane from the cached payload, fetching only if absent. */
async function renderHealthPane(main) {
  const health = bootstrapData.health ?? (await loadBootstrapData()).health;
  if (!health) {
    renderError("Could not load /api/health");
    return;
  }
  main.innerHTML = "";
  main.appendChild(heading("h1", "Health"));
  main.appendChild(buildHealthDashboard(health));
  clearSupportRail();
}

/** Build the health dashboard DOM from the `/api/health` payload. */
function buildHealthDashboard(health) {
  const wrap = document.createElement("section");
  wrap.className = "health-dashboard";
  // The global banner (injected at bootstrap) covers every route including health;
  // only add it here if bootstrap didn't already inject one (e.g. if /api/pages
  // was not yet fetched when navigating directly to #/health).
  prependBannerIfNeeded(wrap, health?.stateStatus);
  const rows = HEALTH_METRIC_ROWS.map(([label, key]) => [label, health?.[key] ?? 0]);
  const metrics = definitionList(rows);
  metrics.className = "metric-list";
  wrap.appendChild(metrics);
  wrap.appendChild(buildLintBlock(health?.lint));
  return wrap;
}

/** state.json classifications that surface a user-visible warning banner. */
const BANNER_STATE_STATUSES = new Set(["corrupt", "too-new"]);

/** Banner copy keyed by the state.json classification that triggers it. */
const STATE_BANNER_MESSAGES = {
  corrupt:
    "Warning: state.json is corrupt. Freshness data is unavailable. Re-run `llmwiki compile` to restore.",
  "too-new":
    "Warning: this wiki's state was written by a newer version of llmwiki. Update llmwiki to view it safely.",
};

/** Prepend a state-status banner to `container` if one is not already in the document. */
function prependBannerIfNeeded(container, stateStatus) {
  if (!BANNER_STATE_STATUSES.has(stateStatus)) return;
  if (document.querySelector(".corrupt-state-banner")) return;
  container.prepend(buildStateStatusBanner(stateStatus));
}

/**
 * Build the state-status warning banner. Displayed when `/api/health` or
 * `/api/pages` reports `stateStatus === "corrupt"` (state.json could not be
 * parsed at viewer startup, so freshness data is unreliable) or `"too-new"`
 * (state.json was written by a newer llmwiki than this build understands).
 */
function buildStateStatusBanner(stateStatus) {
  const banner = document.createElement("div");
  banner.className = "corrupt-state-banner";
  banner.setAttribute("role", "alert");
  banner.textContent = STATE_BANNER_MESSAGES[stateStatus];
  return banner;
}

/** Render the lint summary, or a "lint has not been run yet" placeholder. */
function buildLintBlock(lint) {
  const wrap = document.createElement("section");
  wrap.appendChild(heading("h2", "Lint"));
  if (!lint) {
    wrap.appendChild(placeholder("No cached lint summary yet — run `llmwiki lint`."));
    return wrap;
  }
  const rows = LINT_METRIC_ROWS.map(([label, key, fallback]) => [label, lint[key] ?? fallback]);
  wrap.appendChild(definitionList(rows));
  return wrap;
}

/** Render the home dashboard from the cached bootstrap payloads. */
async function loadAndRenderHome() {
  const data = bootstrapData.pages ? bootstrapData : await loadBootstrapData();
  if (!data.pages) {
    renderError("Could not load /api/pages");
    return;
  }
  applyHomeEnvelope(data.pages);
}

/** Apply a successfully fetched bootstrap payload to the chrome + main pane. */
function applyHomeEnvelope(envelope) {
  const main = document.querySelector(MAIN_SELECTOR);
  if (!main) return;
  renderDashboard(main, envelope, bootstrapData.health);
  renderProjectRail(envelope);
  injectGlobalCorruptBanner(envelope?.stateStatus);
}

/**
 * Inject the state-status banner into the app-layout container (above `main`)
 * so it persists across route changes. Runs once at app bootstrap from the
 * /api/pages envelope. No-ops when state is ok/missing or already injected.
 */
function injectGlobalCorruptBanner(stateStatus) {
  if (!BANNER_STATE_STATUSES.has(stateStatus)) return;
  if (document.querySelector(".corrupt-state-banner")) return;
  const layout = document.querySelector(".app-layout");
  if (!layout) return;
  layout.prepend(buildStateStatusBanner(stateStatus));
}

/** Fetch /api/index and render the rendered HTML coming back from the server. */
async function renderIndexPane(main) {
  clearSupportRail();
  try {
    const payload = await fetchJson("/api/index");
    main.innerHTML = "";
    main.appendChild(heading("h1", "Index"));
    appendRenderedBody(main, payload.html);
  } catch (err) {
    handleIndexError(main, err);
  }
}

/** Render either the "wiki/index.md missing" placeholder or a generic error. */
function handleIndexError(main, err) {
  if (err.status !== 404) {
    renderError(`Could not load /api/index: ${err.message}`);
    return;
  }
  main.innerHTML = "";
  main.appendChild(placeholder("wiki/index.md is not available. Run `llmwiki compile`."));
}

/** Fetch /api/page/:dir/:slug and render. */
async function renderPagePane(main, directory, slug) {
  try {
    const payload = await fetchJson(pageApiPath(directory, slug));
    renderPagePayload(main, payload, slug);
  } catch (err) {
    handlePageError(main, err, directory, slug);
  }
}

/** Build the `/api/page/:dir/:slug` URL with both segments percent-encoded. */
function pageApiPath(directory, slug) {
  return `/api/page/${encodeURIComponent(directory)}/${encodeURIComponent(slug)}`;
}

/** Render the body of a successful /api/page response into the main pane. */
function renderPagePayload(main, payload, slug) {
  const title = payload.title || slug;
  main.innerHTML = "";
  main.appendChild(heading("h1", title));
  if (payload.pageDirectory === "queries") {
    main.appendChild(buildQueryQuestion(title));
  }
  appendWarnings(main, payload.warnings || []);
  const body = appendRenderedBody(main, payload.html);
  removeDuplicateLeadingHeading(body, title);
  renderSupportRail(payload);
}

/** Question banner shown above the body for saved-query pages. */
function buildQueryQuestion(title) {
  const p = document.createElement("p");
  p.className = "query-question";
  p.textContent = `Question: ${title}`;
  return p;
}

/** Render the 404 placeholder or a generic error for /api/page failures. */
function handlePageError(main, err, directory, slug) {
  if (err.status !== 404) {
    renderError(`Could not load page: ${err.message}`);
    return;
  }
  main.innerHTML = "";
  main.appendChild(placeholder(`Page not found: ${directory}/${slug}`));
  clearSupportRail();
}

/**
 * Append the server-sanitized HTML body to `main`. The server always
 * returns sanitized markup in `payload.html` (see Slice 4 — `src/viewer/
 * render.ts`), so the client only sets `innerHTML` on a wrapper. Empty
 * `html` means the page had no body after the frontmatter block;
 * surface a visible "no content" placeholder rather than rendering an
 * empty pane.
 */
function appendRenderedBody(main, html) {
  if (typeof html === "string" && html.length > 0) {
    const body = document.createElement("div");
    body.className = "rendered-body";
    body.innerHTML = html;
    main.appendChild(body);
    return body;
  }
  const note = placeholder("No rendered content.");
  main.appendChild(note);
  return note;
}

/** Drop a duplicated first Markdown H1 when it matches the viewer page title. */
function removeDuplicateLeadingHeading(body, title) {
  const heading = leadingH1(body);
  if (!heading) return;
  if (!hasMatchingHeadingText(heading, title)) return;
  heading.remove();
}

/** Return `body.firstElementChild` if it is an H1, else null. */
function leadingH1(body) {
  const first = body?.firstElementChild;
  if (!first) return null;
  return first.tagName === "H1" ? first : null;
}

/** True when the heading text matches `title` after trimming both sides. */
function hasMatchingHeadingText(heading, title) {
  if (!title) return false;
  const headingText = heading.textContent?.trim();
  return headingText === title.trim();
}

/** Render every payload warning as a banner above the page body. */
function appendWarnings(main, warnings) {
  for (const w of warnings) {
    const banner = document.createElement("div");
    banner.className = "warning-banner";
    banner.textContent = w.message || w.code;
    main.appendChild(banner);
  }
}

/** Render a top-of-main error banner without crashing the rest of the UI. */
function renderError(message) {
  const main = document.querySelector(MAIN_SELECTOR);
  if (!main) return;
  main.innerHTML = "";
  const banner = document.createElement("div");
  banner.className = "warning-banner";
  banner.textContent = message;
  main.appendChild(banner);
  clearSupportRail();
}

/** Fetch /api/graph and render the force-directed graph view. */
async function renderGraphPane(main) {
  clearSupportRail();
  main.innerHTML = "";
  main.className = "main-pane graph-pane";
  await loadGraph(main);
}

/** Promise-returning fetch helper that surfaces non-2xx statuses as errors. */
async function fetchJson(pathname) {
  const res = await fetch(pathname, { credentials: "same-origin" });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Bootstrap: first-paint nav, then parallel data fetch, then the router. */
function main() {
  wireThemeToggle();
  renderSidebar({});
  wireSearch({ fetchJson });
  void loadBootstrapData().then((data) => {
    renderSidebar(sidebarModel(data));
    renderHeader(data.pages);
    injectGlobalCorruptBanner(data.pages?.stateStatus);
    void renderRoute();
  });
  window.addEventListener("hashchange", () => {
    void renderRoute();
  });
  void renderRoute();
}

/** Project the bootstrap payloads into the sidebar's render model. */
// Optional chaining on three independent fields inflates cyclomatic count for
// what is a straight-line projection (cognitive complexity: 1).
// fallow-ignore-next-line complexity
function sidebarModel(data) {
  return {
    project: data.pages?.project,
    counts: data.pages?.counts,
    lint: data.health?.lint ?? null,
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main, { once: true });
} else {
  main();
}
