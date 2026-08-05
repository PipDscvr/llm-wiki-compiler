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

/** Mount the home route with the given envelope shape and lint block. */
async function mountDashboard(
  danglingCount: number,
  unresolved: number,
  lint: unknown = null,
): Promise<HTMLElement> {
  const responder: FetchResponder = (url) => {
    if (url.endsWith("/api/pages")) return jsonResponse(envelopeWith(danglingCount, unresolved));
    if (url.endsWith("/api/health")) return jsonResponse({ lint });
    if (url.endsWith("/api/graph")) return jsonResponse({ nodes: [], edges: [] });
    return null;
  };
  const { dom } = await mountViewerDom([], responder);
  return dom.window.document.querySelector("[data-main-pane]") as HTMLElement;
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
});

describe("dashboard panels", () => {
  it("renders the recently-compiled list", async () => {
    const main = await mountDashboard(0, 0);
    expect(main.querySelector(".recent-row")).toBeTruthy();
  });

  it("renders a citations-resolved bar in the compile receipt", async () => {
    const main = await mountDashboard(0, 2);
    const receipt = main.querySelector("[data-compile-receipt]")?.textContent ?? "";
    expect(receipt).toContain("Citations resolved");
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
});
