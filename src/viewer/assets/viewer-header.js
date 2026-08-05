/**
 * llmwiki viewer — persistent header chrome renderer.
 *
 * The header (project title, freshness badge, meta line) persists across
 * every route, so `renderHeader` is called once from the bootstrap
 * `/api/pages` envelope in viewer.js's `main()`, rather than per-route like
 * the main pane. Split out of viewer.js into its own module to keep that
 * file under the project's 400-line budget (CLAUDE.md) — this module owns
 * nothing viewer.js needs back, so the only export is `renderHeader`.
 *
 * The meta line deliberately says "snapshot" rather than "compiled":
 * `updatedAt` is the viewer's snapshot-build time, not the time the wiki
 * was compiled — labelling it "compiled" would assert something that may
 * never have happened at that moment.
 */

import { formatUtcTimestamp, freshnessBadgeText, projectTitle } from "./viewer-format.js";

const TITLE_SELECTOR = "[data-app-title]";
const META_SELECTOR = "[data-app-meta]";
const FRESHNESS_BADGE_SELECTOR = "[data-freshness-badge]";

/** Render the persistent header identity, freshness badge, and meta line. */
export function renderHeader(envelope) {
  const titleEl = document.querySelector(TITLE_SELECTOR);
  if (titleEl) titleEl.textContent = projectTitle(envelope);
  renderFreshnessBadge(envelope?.counts);
  renderHeaderMeta(envelope);
}

/**
 * Badge overall freshness. Fresh is the neutral, expected state and gets a
 * calm marker; stale and orphaned are actionable and get the warning
 * treatment with their counts.
 */
// CRAP is estimated from zero call-graph references into this module: the
// JSDOM harness (test/fixtures/viewer-jsdom.ts) evals viewer-header.js from
// source rather than importing it, so static analysis cannot see that
// test/viewer-header.test.ts exercises this via renderHeader. Not missing
// tests — see viewer-format.js for the same, earlier-established caveat.
// fallow-ignore-next-line complexity
function renderFreshnessBadge(counts) {
  const badge = document.querySelector(FRESHNESS_BADGE_SELECTOR);
  if (!badge || !counts) return;
  const stale = counts.stale ?? 0;
  const orphaned = counts.orphaned ?? 0;
  badge.hidden = false;
  badge.className = `freshness-pill ${stale + orphaned === 0 ? "is-ok" : "is-warn"}`;
  badge.textContent = freshnessBadgeText(stale, orphaned, "ALL PAGES FRESH");
}

/**
 * Render the header meta line. Deliberately says "snapshot" rather than
 * "compiled": `updatedAt` is the viewer's snapshot-build time, not the
 * time the wiki was compiled.
 */
// Same call-graph blind spot as renderFreshnessBadge above — see that
// function's comment.
// fallow-ignore-next-line complexity
function renderHeaderMeta(envelope) {
  const meta = document.querySelector(META_SELECTOR);
  if (!meta) return;
  const parts = [
    `snapshot ${formatUtcTimestamp(envelope?.updatedAt)}`,
    `profile ${envelope?.profileId ?? "default"}`,
    `state ${envelope?.stateStatus ?? "unknown"}`,
  ];
  meta.textContent = parts.join(" · ");
}
