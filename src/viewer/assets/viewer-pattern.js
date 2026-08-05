/**
 * llmwiki viewer — dashboard pattern strip (dismiss + persistence).
 *
 * The four-column "The LLM Wiki pattern" explainer strip on the Overview
 * dashboard. Split out of viewer-dashboard.js (2026-08-05) purely to stay
 * under CLAUDE.md's 400-code-line file cap — the dismiss/persistence logic
 * added here pushed the dashboard module over it; nothing about the strip
 * is dashboard-specific enough to require living in that file.
 *
 * Persistence follows viewer-theme.js's pattern: one localStorage key, read
 * and written through their own try/catch so a throw (private browsing,
 * storage disabled, a full quota) degrades gracefully instead of taking the
 * caller down with it. The two directions degrade differently on purpose:
 *   - A throwing READ defaults to "not dismissed" (fail OPEN) — the strip
 *     stays visible rather than silently vanishing because storage glitched.
 *     Losing the explainer permanently with no way to know why would be
 *     worse than showing it one extra time.
 *   - A throwing WRITE still removes the strip from THIS page — the click
 *     itself must always work (see `dismissPatternStrip`) — it just will
 *     not stay dismissed after a reload. Matches `viewer-theme.js`'s
 *     `persistTheme()` "session-only" degradation.
 */

import { el } from "./viewer-dom.js";

const STORAGE_KEY = "llmwiki-viewer-pattern-dismissed";

/** The four explainer columns. Static copy — no data behind them. */
const PATTERN_COLUMNS = [
  ["01 · COMPILE ONCE", "Knowledge is extracted once into durable pages instead of re-discovered from raw files at query time."],
  ["02 · TRACEABLE", "Every claim carries a source span you can open at the exact line and verify yourself."],
  ["03 · AGENT & HUMAN", "The same pages browse well, lint cleanly, and export as retrieval-ready context."],
  ["04 · PROFILES", "Domain types and workflows arrive as profiles — no domain branches inside the compiler."],
];

/**
 * Read the stored dismissal. Fails open: a throwing/disabled localStorage
 * is treated as "not dismissed" rather than propagating (see file header),
 * so a storage glitch can only ever show the strip an extra time, never
 * take the rest of the dashboard render down with it.
 */
function isPatternDismissed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Persist the dismissal. A throwing write degrades to a session-only dismissal (see file header). */
function persistPatternDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Session-only dismissal is an acceptable degradation.
  }
}

/**
 * Handle a dismiss click: persist first, then remove the strip from the DOM.
 * `persistPatternDismissed` never throws (see above), so both steps always
 * run — the removal is not conditioned on the write having succeeded.
 */
function dismissPatternStrip(event) {
  persistPatternDismissed();
  event.currentTarget.closest(".pattern-strip")?.remove();
}

/**
 * Build the dismiss control: a real `<button>`, not the bare "×" glyph its
 * own label implies — the glyph alone is not an accessible name (WCAG
 * 4.1.2), the same rule the graph panel's expand chip follows
 * (`buildGraphPanelControls`, viewer-dashboard.js). Reuses `.panel-chip`
 * (introduced for that same Fit/expand pair, commit c786404) rather than a
 * new control style — the same quiet chip treatment, just a different
 * glyph and action.
 */
function buildPatternDismissButton() {
  const button = el("button", "panel-chip", "×");
  button.type = "button";
  button.dataset.patternDismiss = "";
  button.setAttribute("aria-label", "Dismiss this panel");
  button.title = "Dismiss this panel";
  button.addEventListener("click", dismissPatternStrip);
  return button;
}

/**
 * Build the pattern strip's head band: title left, caption + dismiss button
 * grouped right (`.pattern-head-right`, viewer-dashboard.css) so
 * `.pattern-head`'s space-between keeps the title alone on the left. The
 * caption's wording ("shown until you dismiss it") is the promise
 * `dismissPatternStrip` now keeps.
 */
function buildPatternHead() {
  const head = el("div", "pattern-head");
  head.appendChild(el("span", "pattern-title", "The LLM Wiki pattern"));
  const right = el("div", "pattern-head-right");
  right.appendChild(el("span", "pattern-head-caption", "shown until you dismiss it"));
  right.appendChild(buildPatternDismissButton());
  head.appendChild(right);
  return head;
}

/**
 * Build the four-column explainer strip, or `null` once dismissed. The
 * caller (`renderDashboard`, viewer-dashboard.js) must skip appending when
 * this returns `null` rather than adding an empty or hidden element.
 *
 * @returns {HTMLElement|null}
 */
export function buildPatternStrip() {
  if (isPatternDismissed()) return null;
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
