/**
 * Contract tests for the JSDOM mounting harness itself.
 *
 * The harness rewrites ES-module imports into registry reads because
 * JSDOM's `eval` does not drive module loading. These tests pin that
 * rewrite so adding a new viewer module never silently fails to mount.
 */

import { describe, expect, it } from "vitest";
import { jsonResponse, mountViewerDom, type FetchResponder } from "./fixtures/viewer-jsdom.js";

const EMPTY_ENVELOPE = {
  project: { title: "demo", rootName: "demo" },
  counts: {},
  pages: [],
  recentPages: [],
  index: { available: false },
};

const responder: FetchResponder = (url) => {
  if (url.endsWith("/api/pages")) return jsonResponse(EMPTY_ENVELOPE);
  if (url.endsWith("/api/health")) return jsonResponse({ lint: null });
  return null;
};

describe("viewer JSDOM harness", () => {
  it("registers every viewer-*.js module in the window registry", async () => {
    const { dom } = await mountViewerDom([], responder);
    const registry = (dom.window as unknown as { __viewerModules: Record<string, unknown> })
      .__viewerModules;
    expect(registry["./viewer-search.js"]).toBeTruthy();
    expect(registry["./viewer-sidebar.js"]).toBeTruthy();
    expect(registry["./viewer-rail.js"]).toBeTruthy();
  });

  it("exposes each module's named exports as callable functions", async () => {
    const { dom } = await mountViewerDom([], responder);
    const registry = (dom.window as unknown as {
      __viewerModules: Record<string, Record<string, unknown>>;
    }).__viewerModules;
    expect(typeof registry["./viewer-sidebar.js"].renderSidebar).toBe("function");
    expect(typeof registry["./viewer-rail.js"].clearSupportRail).toBe("function");
  });

  it("still renders the shell so existing DOM tests keep working", async () => {
    const { dom } = await mountViewerDom([], responder);
    expect(dom.window.document.querySelector("[data-main-pane]")).toBeTruthy();
  });
});
