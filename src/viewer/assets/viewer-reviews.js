/**
 * llmwiki viewer — the #/reviews list route.
 *
 * A peer of #/concepts, #/queries, and #/sources: same `.list-row` language,
 * same empty-state contract. It lives in its own module rather than in
 * viewer-lists.js because that module's routes all render from the already
 * fetched /api/pages envelope and issue no request of their own — review
 * candidates are not in the frozen snapshot, so this route is fed by a
 * per-visit /api/reviews fetch.
 *
 * Rows are informational only. The viewer is a read-only snapshot with no
 * write path, so there is no approve/reject affordance here — the row states
 * what is held and why, and the CLI acts on it.
 */

import { el, emptyState, heading } from "./viewer-dom.js";
import { relativeAge } from "./viewer-format.js";

/**
 * Human wording for each policy held-reason code (see `src/review/policy.ts`
 * for the closed set). A reader of the review queue needs to know what to do
 * about a hold; `provenance-violating` does not say that and "Citation problem"
 * does. Unknown codes fall through to the raw code so a reason added later is
 * visible-but-ugly rather than silently invisible.
 */
const HELD_REASON_LABELS = {
  "low-confidence": "Low confidence",
  contradicted: "Contradicts its sources",
  "schema-violating": "Breaks a schema rule",
  "provenance-violating": "Citation problem",
  all: "Policy holds every page",
  "manual-review-requested": "Review requested",
  "imported-okf": "Imported from an OKF bundle",
  "connector-fetched": "Fetched by a connector",
};

/** Wiki subdirectory a candidate lands in when it does not name one. */
const DEFAULT_TARGET_DIRECTORY = "concepts";

/**
 * Render the review-queue route from an `/api/reviews` payload.
 *
 * @param {HTMLElement} main - The main pane to render into.
 * @param {{reviews?: unknown[]}} payload - The `/api/reviews` envelope.
 */
export function renderReviewsList(main, payload) {
  const reviews = reviewsIn(payload);
  main.innerHTML = "";
  main.className = "main-pane list-pane";
  main.appendChild(heading("h1", "Reviews"));
  const body = el("div", "list-body");
  main.appendChild(body);
  if (reviews.length === 0) {
    body.appendChild(emptyReviewsState());
    return;
  }
  for (const review of reviews) body.appendChild(buildReviewRow(review));
}

/** The rows in an `/api/reviews` envelope, defended against a malformed payload. */
function reviewsIn(payload) {
  return Array.isArray(payload?.reviews) ? payload.reviews : [];
}

/**
 * Empty state for a queue with nothing pending. An empty review queue is the
 * common case AND a good one, so it gets the design system's teaching card
 * rather than the italic placeholder — that helper is for transient loading
 * text, and this state is neither transient nor a failure.
 */
function emptyReviewsState() {
  return emptyState(
    "Nothing awaiting review",
    "Review candidates are pages the compiler held back instead of writing live. Approve one with the CLI and it becomes a wiki page.",
    "$ llmwiki compile --review",
  );
}

/**
 * Build one candidate row: a head line (title plus how long it has waited),
 * the summary, where it came from and where approval would put it, then the
 * reasons it is held.
 */
function buildReviewRow(review) {
  const row = el("div", "list-row review-row");
  row.appendChild(buildReviewHead(review));
  row.appendChild(el("p", "review-summary", reviewSummaryText(review)));
  row.appendChild(el("p", "review-sources", reviewSourcesText(review)));
  row.appendChild(buildReviewReasons(review.heldReasons));
  return row;
}

/**
 * Head line: the title and its age. The title is plain text, NOT a link —
 * a candidate proposes a page that does not exist in `wiki/` yet, so there is
 * nothing to navigate to and a link would 404.
 */
function buildReviewHead(review) {
  const head = el("div", "review-head");
  head.appendChild(el("span", "list-title", review.title || review.slug));
  head.appendChild(el("span", "list-age", relativeAge(review.generatedAt)));
  return head;
}

/** Summary text, falling back to a plain statement rather than an empty line. */
function reviewSummaryText(review) {
  const summary = typeof review.summary === "string" ? review.summary.trim() : "";
  return summary.length > 0 ? summary : "No summary recorded.";
}

/**
 * Provenance line: the source filenames behind the candidate and the wiki
 * subdirectory approval writes into, so the reader can see both what it was
 * built from and where it would land.
 */
// Optional chaining on `sources` plus the empty-sources fallback inflates
// cyclomatic count for what is a two-part string projection (cognitive
// complexity: 2).
// fallow-ignore-next-line complexity
function reviewSourcesText(review) {
  const sources = Array.isArray(review.sources) ? review.sources : [];
  const from = sources.length > 0 ? sources.join(" · ") : "No sources recorded";
  return `${from} → wiki/${review.targetDirectory || DEFAULT_TARGET_DIRECTORY}/`;
}

/** Build the chip row naming every reason the candidate is held. */
function buildReviewReasons(heldReasons) {
  const wrap = el("div", "review-reasons");
  const reasons = Array.isArray(heldReasons) ? heldReasons : [];
  for (const reason of reasons) wrap.appendChild(buildReviewReason(reason));
  return wrap;
}

/**
 * One reason chip. The chip reads as human wording; the structured `detail`
 * (e.g. "confidence 0.4 < 0.6") goes on the title attribute, where it explains
 * the hold on hover without turning every chip into a sentence.
 */
// Optional chaining on the reason's two fields inflates cyclomatic count for
// what is a lookup plus an optional attribute (cognitive complexity: 2).
// fallow-ignore-next-line complexity
function buildReviewReason(reason) {
  const code = typeof reason?.code === "string" ? reason.code : "";
  const chip = el("span", "review-reason", HELD_REASON_LABELS[code] ?? code);
  if (typeof reason?.detail === "string" && reason.detail.length > 0) chip.title = reason.detail;
  return chip;
}
