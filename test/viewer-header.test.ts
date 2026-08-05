/**
 * Header chrome contract.
 *
 * The header carries the project identity, a freshness badge derived from
 * the stale/orphaned counts, and a meta line. The meta line says "snapshot"
 * rather than "compiled" because generatedAt is viewer start time, not
 * compile time — labelling it "compiled" would assert something false.
 */

import { describe, expect, it } from "vitest";
import { jsonResponse, mountViewerDom, type FetchResponder } from "./fixtures/viewer-jsdom.js";

/** Build an envelope with the given freshness counts. */
function envelopeWith(stale: number, orphaned: number) {
  return {
    project: { title: "my-llm-wiki", rootName: "my-llm-wiki" },
    stateStatus: "ok",
    profileId: "default",
    counts: {
      concepts: 7, queries: 0, sourceFiles: 1, pendingReviews: 0,
      compiledSources: 1, stale, orphaned,
    },
    graph: { nodeCount: 12, edgeCount: 20, danglingCount: 0 },
    sourceFilenames: [],
    index: { available: true, href: "/#/index" },
    recentPages: [],
    pages: [],
    updatedAt: "2026-08-04T10:14:00.000Z",
  };
}

/** Mount with the given freshness counts and return the document. */
async function mountWith(stale: number, orphaned: number): Promise<Document> {
  const responder: FetchResponder = (url) => {
    if (url.endsWith("/api/pages")) return jsonResponse(envelopeWith(stale, orphaned));
    if (url.endsWith("/api/health")) return jsonResponse({ lint: null });
    return null;
  };
  const { dom } = await mountViewerDom([], responder);
  return dom.window.document;
}

describe("header chrome", () => {
  it("shows the project title", async () => {
    const doc = await mountWith(0, 0);
    expect(doc.querySelector("[data-app-title]")?.textContent).toBe("my-llm-wiki");
  });

  it("badges ALL PAGES FRESH when nothing is stale or orphaned", async () => {
    const doc = await mountWith(0, 0);
    const badge = doc.querySelector("[data-freshness-badge]");
    expect(badge?.textContent).toContain("ALL PAGES FRESH");
    expect(badge?.className).toContain("is-ok");
  });

  it("badges the stale count when pages are stale", async () => {
    const doc = await mountWith(3, 0);
    const badge = doc.querySelector("[data-freshness-badge]");
    expect(badge?.textContent).toContain("3 STALE");
    expect(badge?.className).toContain("is-warn");
  });

  it("counts orphaned pages toward the warning badge", async () => {
    const doc = await mountWith(0, 2);
    expect(doc.querySelector("[data-freshness-badge]")?.textContent).toContain("2 ORPHANED");
  });

  it("labels the meta line as a snapshot, not a compile", async () => {
    const doc = await mountWith(0, 0);
    const meta = doc.querySelector("[data-app-meta]")?.textContent ?? "";
    expect(meta).toContain("snapshot");
    expect(meta).not.toContain("compiled");
    expect(meta).toContain("profile default");
    expect(meta).toContain("state ok");
  });
});
