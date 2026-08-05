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

/**
 * Freshness statuses that earn the warning dot. Only `"stale"` and
 * `"orphaned"` are actionable; `"fresh"` and `"unverified"` both read as
 * calm — an unverified page (freshness could not be computed, e.g. a
 * missing or corrupt state.json) is not evidence of a problem with the
 * page itself, so it must not warn.
 *
 * Single source of truth for every freshness dot in the viewer. The
 * dashboard and the list routes each once hardcoded their own version of
 * this rule and quietly disagreed about what "unverified" should render
 * as — every consumer now imports this instead of re-deriving it.
 */
const WARN_FRESHNESS_STATUSES = new Set(["stale", "orphaned"]);

/**
 * True when a freshness status should render the warning dot rather than
 * the calm one.
 *
 * @param {unknown} status - A `FreshnessStatus` value, or anything else —
 *   handled defensively so a malformed payload never throws.
 * @returns {boolean}
 */
export function isWarnFreshness(status) {
  return WARN_FRESHNESS_STATUSES.has(status);
}

/**
 * Pluralise a noun by count, e.g. `plural(1, "dangling target")` → "1
 * dangling target", `plural(11, "dangling target")` → "11 dangling
 * targets". Every count-bearing string in the viewer routes through this —
 * originally the graph explorer's node tooltip had its own private copy,
 * and the dashboard wrote several counts as hardcoded-plural template
 * literals that read wrong at exactly 1 (e.g. "1 dangling targets"); both
 * now call this instead of a second pluraliser that could disagree with it
 * at the n=1 boundary.
 *
 * @param {number} count
 * @param {string} noun - Singular form of the noun.
 * @returns {string}
 */
export function plural(count, noun) {
  return `${count} ${noun}${count !== 1 ? "s" : ""}`;
}
