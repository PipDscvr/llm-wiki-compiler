/**
 * Nav entries whose surface a project cannot have are not shown.
 *
 * Workflows are declared BY a profile, so a default-profile project can never
 * have one — and `llmwiki template init` refuses to add a profile to a project
 * that already has pages, so the empty state would be permanent rather than
 * temporary. Advertising the entry there is the same defect as the ⌘K chip for
 * a shortcut that did not exist, and the profile-vocabulary design gates it the
 * same way: its default sidebar has no Pipeline row.
 *
 * The counterpart matters just as much: Reviews stays visible on an empty queue,
 * because a candidate can appear in any project at any time. The rule is "can
 * this project ever have one", not "does it have one now".
 */

import { describe, expect, it } from "vitest";
import { flushMicrotasks, jsonResponse, mountViewerDom, type FetchResponder } from "./fixtures/viewer-jsdom.js";

function envelope(profileId: string): Record<string, unknown> {
  return {
    project: { title: "demo", rootName: "demo" },
    profileId,
    counts: {},
    pages: [],
    recentPages: [],
    index: { available: false },
  };
}

function responderFor(profileId: string): FetchResponder {
  return (url) => {
    if (url.endsWith("/api/pages")) return jsonResponse(envelope(profileId));
    if (url.endsWith("/api/health")) return jsonResponse({ lint: null });
    return null;
  };
}

/** The nav entry for `route`, or null when the sidebar omitted it. */
async function navEntry(profileId: string, route: string): Promise<Element | null> {
  const { dom } = await mountViewerDom([], responderFor(profileId));
  await flushMicrotasks();
  return dom.window.document.querySelector(`[data-sidebar] a[data-route="${route}"]`);
}

describe("sidebar entries a project cannot use", () => {
  it("omits Workflows for a default-profile project", async () => {
    expect(await navEntry("default", "workflows")).toBeNull();
  });

  it("shows Workflows once a profile is active", async () => {
    const entry = await navEntry("newsroom", "workflows");
    expect(entry?.getAttribute("href")).toBe("#/workflows");
  });

  it("still shows Reviews on a default project, empty queue and all", async () => {
    // Reviews is NOT profile-gated: candidates come from `compile --review`,
    // which any project can run. Guards against over-applying the gate.
    expect(await navEntry("default", "reviews")).not.toBeNull();
  });

  it("keeps every non-profile entry on a default project", async () => {
    for (const route of ["home", "concepts", "sources", "queries", "graph", "health"]) {
      expect(await navEntry("default", route)).not.toBeNull();
    }
  });
});
