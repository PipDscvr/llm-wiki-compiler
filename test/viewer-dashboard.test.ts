/**
 * Overview dashboard contract.
 *
 * The four stat cards keep the mockup's inventory/signal split. "Needs
 * attention" is built from dangling links plus unresolved citations —
 * both always present in the snapshot — rather than the lint cache, which
 * is null until `llmwiki lint` first runs and would render the design's
 * focal card blank on a fresh project.
 */

import { describe, expect, it } from "vitest";
import { jsonResponse, mountViewerDom, type FetchResponder } from "./fixtures/viewer-jsdom.js";

/** Build an envelope with the given dangling count and citation totals. */
function envelopeWith(danglingCount: number, unresolved: number) {
  return {
    project: { title: "my-llm-wiki", rootName: "my-llm-wiki" },
    stateStatus: "ok",
    profileId: "default",
    counts: {
      concepts: 7, queries: 0, sourceFiles: 1, pendingReviews: 0,
      compiledSources: 1, stale: 0, orphaned: 0,
    },
    graph: { nodeCount: 128, edgeCount: 256, danglingCount },
    sourceFilenames: ["karpathy.md"],
    index: { available: true, href: "/#/index" },
    recentPages: [
      { id: "concepts/alpha", pageDirectory: "concepts", slug: "alpha",
        title: "Alpha", updatedAt: "2026-08-02T00:00:00.000Z" },
    ],
    pages: [
      { id: "concepts/alpha", pageDirectory: "concepts", slug: "alpha", title: "Alpha",
        kind: "concept", summary: "", updatedAt: "2026-08-02T00:00:00.000Z", warnings: [],
        freshness: { freshnessStatus: "fresh", contradicted: false, archived: false },
        citationCount: 8, unresolvedCitationCount: unresolved },
    ],
    updatedAt: "2026-08-04T10:14:00.000Z",
  };
}

/**
 * Mount the home route with a given /api/pages envelope and lint payload,
 * and return its main pane. The one responder-building implementation —
 * `mountDashboard` below is a thin convenience wrapper over this rather
 * than a second copy.
 */
async function mountDashboardWithEnvelope(
  envelope: unknown,
  lint: unknown = null,
): Promise<HTMLElement> {
  const responder: FetchResponder = (url) => {
    if (url.endsWith("/api/pages")) return jsonResponse(envelope);
    if (url.endsWith("/api/health")) return jsonResponse({ lint });
    if (url.endsWith("/api/graph")) return jsonResponse({ nodes: [], edges: [] });
    return null;
  };
  const { dom } = await mountViewerDom([], responder);
  return dom.window.document.querySelector("[data-main-pane]") as HTMLElement;
}

/** Mount the home route with the dangling/unresolved shortcut envelope and a lint block. */
async function mountDashboard(
  danglingCount: number,
  unresolved: number,
  lint: unknown = null,
): Promise<HTMLElement> {
  return mountDashboardWithEnvelope(envelopeWith(danglingCount, unresolved), lint);
}

/** Read a stat card by its data-stat key. */
function statValue(main: HTMLElement, key: string): string {
  return main.querySelector(`[data-stat="${key}"] .stat-value`)?.textContent ?? "";
}

describe("dashboard stat cards", () => {
  it("renders the concepts count", async () => {
    const main = await mountDashboard(11, 0);
    expect(statValue(main, "concepts")).toBe("7");
  });

  it("sums dangling links and unresolved citations into needs-attention", async () => {
    const main = await mountDashboard(11, 3);
    expect(statValue(main, "attention")).toBe("14");
  });

  it("styles needs-attention as a warning only when non-zero", async () => {
    const warn = await mountDashboard(11, 0);
    expect(warn.querySelector('[data-stat="attention"]')?.className).toContain("is-warn");
    const calm = await mountDashboard(0, 0);
    expect(calm.querySelector('[data-stat="attention"]')?.className).not.toContain("is-warn");
  });

  it("renders needs-attention without a lint cache", async () => {
    const main = await mountDashboard(4, 0, null);
    expect(statValue(main, "attention")).toBe("4");
  });

  it("shows the compiled/on-disk sub-line on the sources card", async () => {
    const main = await mountDashboard(0, 0);
    const sub = main.querySelector('[data-stat="sources"] .stat-sub')?.textContent ?? "";
    expect(sub).toContain("1 compiled");
    expect(sub).toContain("1 on disk");
  });

  it("scopes the concepts sub-line to concept pages, excluding queries", async () => {
    const base = envelopeWith(0, 0);
    const envelope = {
      ...base,
      counts: { ...base.counts, concepts: 1, queries: 1 },
      pages: [
        { ...base.pages[0], citationCount: 5, unresolvedCitationCount: 0 },
        { id: "queries/q1", pageDirectory: "queries", slug: "q1", title: "Q1",
          kind: "query", summary: "", updatedAt: "2026-08-02T00:00:00.000Z", warnings: [],
          freshness: { freshnessStatus: "fresh", contradicted: false, archived: false },
          citationCount: 3, unresolvedCitationCount: 0 },
      ],
    };
    const main = await mountDashboardWithEnvelope(envelope);
    const sub = main.querySelector('[data-stat="concepts"] .stat-sub')?.textContent ?? "";
    expect(sub).toBe("5 citations · 1 pages");
  });
});

describe("dashboard panels", () => {
  it("renders the recently-compiled list", async () => {
    const main = await mountDashboard(0, 0);
    expect(main.querySelector(".recent-row")).toBeTruthy();
  });

  it("renders a citations-resolved bar in the compile receipt", async () => {
    const main = await mountDashboard(0, 2);
    const receipt = main.querySelector("[data-compile-receipt]") as HTMLElement;
    expect(receipt.textContent).toContain("Citations resolved");
    // Design system's two-segment meter: a filled portion plus a distinct
    // remainder segment, not a single bar — pin the structure, not just the label.
    expect(receipt.querySelector(".bar-track > .bar-fill + .bar-remainder")).toBeTruthy();
  });

  it("lists a dangling-link next action when links dangle", async () => {
    const main = await mountDashboard(11, 0);
    expect(main.querySelector("[data-next-actions]")?.textContent).toContain("11 dangling");
  });

  it("omits the dangling next action when nothing dangles", async () => {
    const main = await mountDashboard(0, 0);
    expect(main.querySelector("[data-next-actions]")?.textContent).not.toContain("dangling");
  });

  it("reserves a container for the graph panel", async () => {
    const main = await mountDashboard(0, 0);
    expect(main.querySelector("[data-graph-panel]")).toBeTruthy();
  });

  it("renders the four-item graph legend with a text label per entry", async () => {
    const main = await mountDashboard(0, 0);
    const legend = main.querySelector(".panel-legend");
    expect(legend).toBeTruthy();
    for (const label of ["concept", "entity", "stale", "dangling"]) {
      expect(legend?.textContent).toContain(label);
    }
  });
});

describe("dashboard recently-compiled freshness dot", () => {
  it("renders the calm dot for unverified freshness, not the warning one", async () => {
    // "unverified" (freshness could not be computed, e.g. a missing or
    // corrupt state.json) must read the same as "fresh" — it is not
    // evidence of a problem with the page. Pins the same rule the
    // #/concepts list route asserts in viewer-lists.test.ts.
    const base = envelopeWith(0, 0);
    const envelope = {
      ...base,
      pages: [
        { ...base.pages[0], freshness: { freshnessStatus: "unverified", contradicted: false, archived: false } },
      ],
    };
    const main = await mountDashboardWithEnvelope(envelope);
    const dot = main.querySelector(".recent-row .list-dot");
    expect(dot?.className).toContain("is-ok");
    expect(dot?.className).not.toContain("is-warn");
  });
});
