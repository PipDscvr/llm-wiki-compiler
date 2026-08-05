/**
 * llmwiki viewer — shared value formatting and derivation.
 *
 * Pure functions over payload values, with no DOM access. These are shared
 * because more than one render module needs the same answer, and two copies
 * of an age calculation drift the moment one of them is fixed.
 */

/** Milliseconds in a day, for whole-day age arithmetic. */
const DAY_MS = 86_400_000;

/** Fallback project title shown until a real one is known. */
const DEFAULT_TITLE = "llmwiki";

/**
 * Display title for an `/api/pages` envelope, with a stable fallback.
 *
 * Shared by viewer.js (dashboard heading) and viewer-header.js (persistent
 * header identity) so the two surfaces cannot disagree about the title.
 *
 * @param {unknown} envelope - The bootstrap envelope; accessed defensively
 *   since first paint can call this before the fetch settles.
 * @returns {string}
 */
export function projectTitle(envelope) {
  return envelope?.project?.title || DEFAULT_TITLE;
}

/**
 * Whole-day age of an ISO timestamp, e.g. "3d". Returns "today" for anything
 * less than a day old and "" when the timestamp is absent or unparseable —
 * an empty cell reads better than "NaNd".
 *
 * @param {unknown} iso - ISO-8601 timestamp.
 * @returns {string}
 */
// CRAP is estimated from zero call-graph references into this module:
// test/viewer-format.test.ts reads this file's source and evals it directly
// (JSDOM's eval does not drive ES-module loading — see
// test/fixtures/viewer-jsdom.ts for the same constraint applied to the
// shared harness), so static analysis cannot see that every branch below is
// exercised by that file's "relativeAge" describe block. Not missing tests,
// and not missing callers either — viewer-lists.js and viewer-dashboard.js
// both import this directly; fallow just cannot trace either edge.
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
 */
// Same call-graph blind spot as relativeAge above — see that function's
// comment.
// fallow-ignore-next-line complexity
export function lintTotal(lint) {
  if (!lint || typeof lint !== "object") return null;
  const warnings = typeof lint.warnings === "number" ? lint.warnings : 0;
  const errors = typeof lint.errors === "number" ? lint.errors : 0;
  return warnings + errors;
}
