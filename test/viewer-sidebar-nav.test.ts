/**
 * Sidebar navigation contract.
 *
 * The Nebula sidebar is pure navigation with counts — the page tree and the
 * freshness filter live on #/concepts. These tests pin the nav entries, the
 * count rendering rules (zero renders as an em dash, an unrun lint omits its
 * badge entirely), and active-route marking including page routes marking
 * their parent nav entry.
 */

import { describe, expect, it } from "vitest";
import { jsonResponse, mountViewerDom, type FetchResponder } from "./fixtures/viewer-jsdom.js";

const ENVELOPE = {
  project: { title: "my-llm-wiki", rootName: "my-llm-wiki" },
  stateStatus: "ok",
  profileId: "default",
  counts: {
    concepts: 7, queries: 0, sourceFiles: 1, pendingReviews: 0,
    compiledSources: 1, stale: 0, orphaned: 0,
  },
  graph: { nodeCount: 12, edgeCount: 20, danglingCount: 11 },
  sourceFilenames: ["karpathy.md"],
  index: { available: true, href: "/#/index" },
  recentPages: [],
  pages: [],
};

/** Responder serving the envelope plus a health payload with the given lint block. */
function responderWithLint(lint: unknown): FetchResponder {
  return (url) => {
    if (url.endsWith("/api/pages")) return jsonResponse(ENVELOPE);
    if (url.endsWith("/api/health")) return jsonResponse({ lint });
    return null;
  };
}

/** Mount and return the sidebar element. */
async function mountSidebar(lint: unknown, startHash?: string): Promise<HTMLElement> {
  const { dom } = await mountViewerDom([], responderWithLint(lint), startHash);
  return dom.window.document.querySelector(".sidebar") as HTMLElement;
}

describe("sidebar navigation", () => {
  it("renders the BROWSE and MAINTAIN sections", async () => {
    const sidebar = await mountSidebar(null);
    const labels = Array.from(sidebar.querySelectorAll(".nav-section-label")).map(
      (n) => n.textContent,
    );
    expect(labels).toContain("BROWSE");
    expect(labels).toContain("MAINTAIN");
  });

  it("links each nav entry to its route", async () => {
    const sidebar = await mountSidebar(null);
    const routes = Array.from(sidebar.querySelectorAll("a[data-route]")).map(
      (a) => a.getAttribute("data-route"),
    );
    expect(routes).toEqual(
      expect.arrayContaining(["home", "concepts", "sources", "queries", "graph", "health"]),
    );
  });

  it("renders the project title and read-only marker", async () => {
    const sidebar = await mountSidebar(null);
    expect(sidebar.querySelector("[data-project-name]")?.textContent).toBe("my-llm-wiki");
    expect(sidebar.textContent).toContain("LOCAL · READ ONLY");
  });

  it("renders a zero count as an em dash", async () => {
    const sidebar = await mountSidebar(null);
    const queries = sidebar.querySelector('a[data-route="queries"] .nav-count');
    expect(queries?.textContent).toBe("—");
  });

  it("marks a zero count with the nav-count-zero modifier (--fg-disabled)", async () => {
    const sidebar = await mountSidebar(null);
    const queries = sidebar.querySelector('a[data-route="queries"] .nav-count');
    expect(queries?.className).toContain("nav-count-zero");
  });

  it("renders a non-zero count as its number", async () => {
    const sidebar = await mountSidebar(null);
    expect(sidebar.querySelector('a[data-route="concepts"] .nav-count')?.textContent).toBe("7");
  });

  it("does not mark a non-zero count with the nav-count-zero modifier", async () => {
    const sidebar = await mountSidebar(null);
    const concepts = sidebar.querySelector('a[data-route="concepts"] .nav-count');
    expect(concepts?.className).not.toContain("nav-count-zero");
  });

  it("gives PROJECT its own label class, distinct from BROWSE/MAINTAIN", async () => {
    const sidebar = await mountSidebar(null);
    expect(sidebar.querySelector(".project-label")?.textContent).toBe("PROJECT");
    expect(sidebar.querySelectorAll(".nav-section-label")).toHaveLength(2);
  });

  it("omits the lint badge entirely when lint has never run", async () => {
    const sidebar = await mountSidebar(null);
    expect(sidebar.querySelector('a[data-route="health"] .nav-badge')).toBeNull();
  });

  it("sums warnings and errors into the lint badge", async () => {
    const sidebar = await mountSidebar({ warnings: 9, errors: 2, at: "2026-08-01T00:00:00.000Z" });
    expect(sidebar.querySelector('a[data-route="health"] .nav-badge')?.textContent).toBe("11");
  });

  it("marks a page route's parent nav entry as current", async () => {
    const sidebar = await mountSidebar(null, "#/concepts/alpha");
    const concepts = sidebar.querySelector('a[data-route="concepts"]');
    expect(concepts?.getAttribute("aria-current")).toBe("page");
  });

  it("does not render Settings or Compile & export", async () => {
    const sidebar = await mountSidebar(null);
    expect(sidebar.textContent).not.toContain("Settings");
    expect(sidebar.textContent).not.toContain("Compile & export");
  });
});
