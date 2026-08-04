/**
 * Contract tests for the JSDOM mounting harness itself.
 *
 * The harness rewrites ES-module imports into registry reads because
 * JSDOM's `eval` does not drive module loading. These tests pin that
 * rewrite so adding a new viewer module never silently fails to mount.
 */

import { rm, writeFile } from "fs/promises";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
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

// --- Export-form support ---
//
// The harness must strip every `export` keyword before JSDOM's `eval` sees
// it (there is no module loader). These tests write real, throwaway module
// files into src/viewer/assets/ — the harness discovers modules by
// directory scan, so this is the only way to pin its behaviour against a
// module it did not already know about — and delete them in `afterEach` so
// a failed assertion can never leave a stray file poisoning later runs.
const ASSETS_DIR = path.resolve("src/viewer/assets");
const SUPPORTED_FIXTURE = path.join(ASSETS_DIR, "viewer-export-form-check.js");
const UNSUPPORTED_FIXTURE = path.join(ASSETS_DIR, "viewer-export-default-check.js");

describe("viewer JSDOM harness — export form support", () => {
  afterEach(async () => {
    await rm(SUPPORTED_FIXTURE, { force: true });
    await rm(UNSUPPORTED_FIXTURE, { force: true });
  });

  it("mounts export-const and export-async-function forms with callable exports", async () => {
    await writeFile(
      SUPPORTED_FIXTURE,
      'export async function tempAsyncExport() { return "ok"; }\n' +
        'export const tempConstExport = () => "ok";\n',
      "utf-8",
    );
    const { dom } = await mountViewerDom([], responder);
    const registry = (dom.window as unknown as {
      __viewerModules: Record<string, Record<string, unknown>>;
    }).__viewerModules;
    const mod = registry["./viewer-export-form-check.js"];
    expect(typeof mod.tempAsyncExport).toBe("function");
    expect(typeof mod.tempConstExport).toBe("function");
  });

  it("fails loudly, naming the file, for an unsupported export form", async () => {
    await writeFile(UNSUPPORTED_FIXTURE, "export default function tempDefaultExport() {}\n", "utf-8");
    await expect(mountViewerDom([], responder)).rejects.toThrow(/viewer-export-default-check\.js/);
  });
});
