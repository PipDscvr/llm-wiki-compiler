/**
 * DOM-level tests for the health dashboard pane rendered by viewer.js.
 *
 * Navigates to `#/health` via the JSDOM harness and asserts against the
 * five-card `.stat-grid` the route renders through the shared `buildStatCard`
 * component (viewer-stat-card.js) — the same one the Overview dashboard's
 * stat grid uses. Card values/sub-lines are read by `data-stat` key, mirroring
 * `statValue` in test/viewer-dashboard.test.ts.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flushMicrotasks,
  jsonResponse,
  mountViewerDom,
  type EmbeddedPage,
  type FetchResponder,
} from "./fixtures/viewer-jsdom.js";

const EMPTY_PAGES: EmbeddedPage[] = [];

/** Build a fetch responder that serves the given health payload. */
function healthResponder(health: Record<string, unknown>): FetchResponder {
  return (url) => {
    if (url.endsWith("/api/pages")) {
      return jsonResponse({ project: { title: "demo" }, counts: {}, pages: [], recentPages: [], index: { available: false } });
    }
    if (url.endsWith("/api/health")) return jsonResponse(health);
    return null;
  };
}

/** Mount the viewer, navigate to #/health, and return the main pane element. */
async function renderHealthPane(health: Record<string, unknown>): Promise<HTMLElement> {
  const { dom } = await mountViewerDom(EMPTY_PAGES, healthResponder(health));
  dom.window.location.hash = "#/health";
  await flushMicrotasks();
  return dom.window.document.querySelector("[data-main-pane]") as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Build a /api/pages responder carrying a given stateStatus, plus /api/health. */
function pagesResponder(stateStatus: string): FetchResponder {
  return (url) => {
    if (url.endsWith("/api/pages")) {
      return jsonResponse({
        project: { title: "demo" },
        counts: {},
        pages: [],
        recentPages: [],
        index: { available: false },
        stateStatus,
      });
    }
    if (url.endsWith("/api/health")) return jsonResponse({ stateStatus });
    return null;
  };
}

/** Mount the viewer with a given bootstrap stateStatus and return its document. */
async function mountWithStateStatus(stateStatus: string): Promise<Document> {
  const { dom } = await mountViewerDom(EMPTY_PAGES, pagesResponder(stateStatus));
  return dom.window.document;
}

describe("state-status banner — corrupt and too-new", () => {
  it("renders the corrupt banner when stateStatus is corrupt", async () => {
    const doc = await mountWithStateStatus("corrupt");
    const banner = doc.querySelector(".corrupt-state-banner");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("corrupt");
  });

  it("renders the too-new banner when stateStatus is too-new", async () => {
    const doc = await mountWithStateStatus("too-new");
    const banner = doc.querySelector(".corrupt-state-banner");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("newer version of llmwiki");
  });

  it("renders no banner when stateStatus is ok", async () => {
    const doc = await mountWithStateStatus("ok");
    expect(doc.querySelector(".corrupt-state-banner")).toBeNull();
  });
});

/** Read a health stat card's value by its data-stat key. */
function statValue(main: HTMLElement, key: string): string {
  return main.querySelector(`[data-stat="${key}"] .stat-value`)?.textContent ?? "";
}

/** Read a health stat card's sub-line by its data-stat key. */
function statSub(main: HTMLElement, key: string): string {
  return main.querySelector(`[data-stat="${key}"] .stat-sub`)?.textContent ?? "";
}

/** Read a health stat card's badge text by its data-stat key. */
function statBadge(main: HTMLElement, key: string): string {
  return main.querySelector(`[data-stat="${key}"] .stat-badge`)?.textContent ?? "";
}

/**
 * Seven distinct primes, one per /api/health field, so no two metrics can
 * share a rendered digit — a textContent-substring assertion on one number
 * can never accidentally pass because a different card printed it.
 */
const FULL_HEALTH = {
  concepts: 11, queries: 13, sources: 17, sourceFiles: 19,
  stale: 23, orphaned: 29, pendingReviews: 31,
};

describe("health dashboard — stat cards", () => {
  it("renders five stat cards on #/health", async () => {
    const main = await renderHealthPane(FULL_HEALTH);
    expect(main.querySelectorAll(".stat-card")).toHaveLength(5);
  });

  it("surfaces all seven /api/health numbers across the five cards", async () => {
    const main = await renderHealthPane(FULL_HEALTH);
    const text = main.textContent ?? "";
    for (const n of Object.values(FULL_HEALTH)) {
      expect(text).toContain(String(n));
    }
  });

  it("renders the concepts and saved-queries card values directly from the payload", async () => {
    const main = await renderHealthPane(FULL_HEALTH);
    expect(statValue(main, "concepts")).toBe("11");
    expect(statValue(main, "queries")).toBe("13");
  });

  it("shows conditional copy on the concepts and saved-queries sub-lines at zero", async () => {
    const main = await renderHealthPane({ concepts: 0, queries: 0 });
    expect(statSub(main, "concepts")).toBe("no concept pages yet");
    expect(statSub(main, "queries")).toBe("none saved yet");
  });

  it("counts concepts+queries and pluralizes saved answers once either is non-zero", async () => {
    const main = await renderHealthPane({ concepts: 5, queries: 2 });
    expect(statSub(main, "concepts")).toBe("7 pages in the wiki");
    expect(statSub(main, "queries")).toBe("2 saved answers");
  });

  it("mirrors the dashboard's sources card: value is sourceFiles, sub-line names both counts", async () => {
    const main = await renderHealthPane(FULL_HEALTH);
    expect(statValue(main, "sources")).toBe("19");
    const sub = statSub(main, "sources");
    expect(sub).toContain("17 compiled");
    expect(sub).toContain("19 on disk");
  });

  it("sums stale and orphaned into the freshness card's value and sub-line", async () => {
    const main = await renderHealthPane(FULL_HEALTH);
    expect(statValue(main, "freshness")).toBe("52");
    const sub = statSub(main, "freshness");
    expect(sub).toContain("23 stale");
    expect(sub).toContain("29 orphaned");
  });

  it("flags the freshness card as a warning when stale or orphaned is non-zero", async () => {
    const main = await renderHealthPane({ stale: 1, orphaned: 0 });
    expect(main.querySelector('[data-stat="freshness"]')?.className).toContain("is-warn");
  });

  it("shows the freshness card's calm IN SYNC badge when both stale and orphaned are zero", async () => {
    const main = await renderHealthPane({ stale: 0, orphaned: 0 });
    const card = main.querySelector('[data-stat="freshness"]');
    expect(card?.className).not.toContain("is-warn");
    expect(card?.className).toContain("is-calm");
    expect(statBadge(main, "freshness")).toBe("IN SYNC");
  });

  it("flags the awaiting-review card as a warning and pluralizes candidates when non-zero", async () => {
    const main = await renderHealthPane({ pendingReviews: 2 });
    expect(main.querySelector('[data-stat="reviews"]')?.className).toContain("is-warn");
    expect(statSub(main, "reviews")).toBe("2 candidates");
  });

  it("shows the awaiting-review card's calm CLEAR badge and empty-queue sub-line at zero", async () => {
    const main = await renderHealthPane({ pendingReviews: 0 });
    const card = main.querySelector('[data-stat="reviews"]');
    expect(card?.className).not.toContain("is-warn");
    expect(card?.className).toContain("is-calm");
    expect(statBadge(main, "reviews")).toBe("CLEAR");
    expect(statSub(main, "reviews")).toBe("queue is empty");
  });

  it("defaults every card's value to 0 when the health payload has no metrics", async () => {
    const main = await renderHealthPane({});
    expect(statValue(main, "concepts")).toBe("0");
    expect(statValue(main, "queries")).toBe("0");
    expect(statValue(main, "sources")).toBe("0");
    expect(statValue(main, "freshness")).toBe("0");
    expect(statValue(main, "reviews")).toBe("0");
  });
});
