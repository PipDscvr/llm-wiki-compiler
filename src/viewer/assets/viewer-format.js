// fallow-ignore-file unused-file
// This module ships ahead of its consumers (extract-before-use, per Task 5
// of the nebula-viewer-ui plan): viewer-lists.js, viewer-dashboard.js, and
// viewer-sidebar.js import relativeAge/lintTotal in later tasks. Nothing on
// this branch imports the file yet, which fallow's static graph reads as
// dead. See test/viewer-format.test.ts for the real, already-written tests.

/**
 * llmwiki viewer — shared value formatting and derivation.
 *
 * Pure functions over payload values, with no DOM access. These are shared
 * because more than one render module needs the same answer, and two copies
 * of an age calculation drift the moment one of them is fixed.
 */

/** Milliseconds in a day, for whole-day age arithmetic. */
const DAY_MS = 86_400_000;

/**
 * Whole-day age of an ISO timestamp, e.g. "3d". Returns "today" for anything
 * less than a day old and "" when the timestamp is absent or unparseable —
 * an empty cell reads better than "NaNd".
 *
 * @param {unknown} iso - ISO-8601 timestamp.
 * @returns {string}
 * @expected-unused Not yet called on this branch; six later tasks in the
 *   nebula-viewer-ui plan import it. Fallow should flag the tag itself as
 *   stale once one of them does — that is the intended cue to remove it.
 */
// CRAP is estimated from zero call-graph references at this point in the
// rollout, not from missing tests (see test/viewer-format.test.ts).
// fallow-ignore-next-line complexity
export function relativeAge(iso) {
  if (typeof iso !== "string" || iso.length === 0) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const days = Math.floor((Date.now() - then) / DAY_MS);
  if (days <= 0) return "today";
  return `${days}d`;
}

/**
 * Total lint findings, or null when lint has never run.
 *
 * A null cache is NOT reported as zero: "no lint run" and "a clean lint run"
 * are different facts, and returning 0 for both would assert the stronger one.
 * Callers decide how to render null — the sidebar omits its badge, the compile
 * receipt says "never run".
 *
 * @param {unknown} lint - The `/api/health` lint cache entry, or null.
 * @returns {number|null}
 * @expected-unused Not yet called on this branch; six later tasks in the
 *   nebula-viewer-ui plan import it. Fallow should flag the tag itself as
 *   stale once one of them does — that is the intended cue to remove it.
 */
// CRAP is estimated from zero call-graph references at this point in the
// rollout, not from missing tests (see test/viewer-format.test.ts).
// fallow-ignore-next-line complexity
export function lintTotal(lint) {
  if (!lint || typeof lint !== "object") return null;
  const warnings = typeof lint.warnings === "number" ? lint.warnings : 0;
  const errors = typeof lint.errors === "number" ? lint.errors : 0;
  return warnings + errors;
}
