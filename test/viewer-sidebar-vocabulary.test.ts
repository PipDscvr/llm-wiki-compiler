/**
 * BROWSE is a projection of the active profile's declared entity types.
 *
 * The design's central claim is that "Concepts" was never a fixed label — it is
 * what the DEFAULT profile calls its one entity type. So a default project must
 * render exactly the sidebar it renders today, and a profile project renders its
 * own types in that same slot. Both halves are pinned here, the default one
 * first, because it is the regression this whole change risks.
 *
 * The fixed spine (Overview, Sources, Graph explorer) never varies; only the
 * type rows between Overview and Sources do.
 */

import { describe, expect, it } from "vitest";
import {
  browseEntries,
  browseProfileName,
  manyTypes,
  mountVocabularySidebar,
  typeRows,
  types,
} from "./fixtures/viewer-vocabulary.js";

/** The row count above which BROWSE caps its type list (NAV_TYPE_CAP). */
const CAP = 11;

describe("BROWSE on a default project", () => {
  it("renders exactly today's rows, in today's order", async () => {
    const sidebar = await mountVocabularySidebar(undefined);
    expect(browseEntries(sidebar)).toEqual([
      { route: "home", href: "#/", label: "Overview" },
      { route: "concepts", href: "#/concepts", label: "Concepts" },
      { route: "sources", href: "#/sources", label: "Sources" },
      { route: "queries", href: "#/queries", label: "Queries" },
      { route: "graph", href: "#/graph", label: "Graph explorer" },
    ]);
  });

  it("puts no profile name on the BROWSE header", async () => {
    const sidebar = await mountVocabularySidebar(undefined);
    expect(browseProfileName(sidebar)).toBeNull();
  });

  it("renders no type group at all", async () => {
    const sidebar = await mountVocabularySidebar(undefined);
    expect(sidebar.querySelector(".nav-type-group")).toBeNull();
  });
});

describe("BROWSE on a profile project", () => {
  it("replaces Concepts and Queries with the profile's own types", async () => {
    const sidebar = await mountVocabularySidebar(types(["articles", 6], ["desks", 3]));
    const entries = browseEntries(sidebar);
    expect(entries.map((e) => e.route)).toEqual([
      "home",
      "articles",
      "desks",
      "sources",
      "graph",
    ]);
  });

  it("keeps the fixed spine either side of the type rows", async () => {
    const sidebar = await mountVocabularySidebar(types(["articles", 6]));
    const entries = browseEntries(sidebar);
    expect(entries[0]).toEqual({ route: "home", href: "#/", label: "Overview" });
    expect(entries.at(-2)?.label).toBe("Sources");
    expect(entries.at(-1)?.label).toBe("Graph explorer");
  });

  it("links each type row at its own namespaced list route", async () => {
    // Namespaced under `#/_type/` so a type named after a route the viewer owns
    // still reaches its own pages — see test/viewer-typed-list-namespace.test.ts.
    const sidebar = await mountVocabularySidebar(types(["articles", 6]));
    const row = sidebar.querySelector('a[data-route="articles"]');
    expect(row?.getAttribute("href")).toBe("#/_type/articles");
  });

  it("title-cases the label while the type id stays the route", async () => {
    const sidebar = await mountVocabularySidebar(types(["instrument_calibrations", 14]));
    const row = sidebar.querySelector('a[data-route="instrument_calibrations"]');
    expect(row?.querySelector(".nav-label")?.textContent).toBe("Instrument calibrations");
  });
});

describe("type row ordering", () => {
  it("sorts by page count descending, declaration order breaking ties", async () => {
    // Declared desks-before-bylines with equal counts: declaration order keeps
    // desks first, alphabetical would put bylines first. articles jumping the
    // queue from second is the count-descending half.
    const sidebar = await mountVocabularySidebar(
      types(["desks", 3], ["articles", 6], ["bylines", 3]),
    );
    expect(typeRows(sidebar)).toEqual(["articles", "desks", "bylines"]);
  });

  it("never re-sorts alphabetically when counts already differ", async () => {
    const sidebar = await mountVocabularySidebar(types(["zebras", 9], ["ants", 2]));
    expect(typeRows(sidebar)).toEqual(["zebras", "ants"]);
  });
});

describe("a type with no pages", () => {
  it("still gets a row — its absence is information", async () => {
    const sidebar = await mountVocabularySidebar(types(["articles", 6], ["stringers", 0]));
    expect(typeRows(sidebar)).toEqual(["articles", "stringers"]);
  });

  it("shows a dim em dash rather than a zero", async () => {
    const sidebar = await mountVocabularySidebar(types(["stringers", 0]));
    const count = sidebar.querySelector('a[data-route="stringers"] .nav-count');
    expect(count?.textContent).toBe("—");
    expect(count?.className).toContain("nav-count-zero");
  });
});

describe("a long type name", () => {
  it("keeps its full text as a title attribute on the label", async () => {
    const sidebar = await mountVocabularySidebar(types(["instrument_calibrations", 14]));
    const label = sidebar.querySelector('a[data-route="instrument_calibrations"] .nav-label');
    expect(label?.getAttribute("title")).toBe("Instrument calibrations");
  });

  it("never truncates the count, which is the scanning target", async () => {
    const sidebar = await mountVocabularySidebar(types(["instrument_calibrations", 148]));
    const count = sidebar.querySelector('a[data-route="instrument_calibrations"] .nav-count');
    expect(count?.textContent).toBe("148");
  });
});

describe("a type named after a route the viewer already owns", () => {
  // The built-in `autosci` template declares both `sources` and `reviews`, so
  // this is a shipped case, not a hypothetical one.
  const SHADOWING = types(["papers", 4], ["sources", 2]);

  it("still gets its row — a declared type is never silently dropped", async () => {
    const sidebar = await mountVocabularySidebar(SHADOWING);
    expect(typeRows(sidebar)).toEqual(["papers", "sources"]);
  });

  it("marks the fixed entry at that hash, never the type row it shadows", async () => {
    const sidebar = await mountVocabularySidebar(SHADOWING, "#/sources");
    const marked = sidebar.querySelector('a[aria-current="page"]');
    expect(marked?.hasAttribute("data-nav-type")).toBe(false);
    expect(marked?.querySelector(".nav-label")?.textContent).toBe("Sources");
  });
});

describe("the profile name on the BROWSE header", () => {
  it("sits on the header itself, not on a row of its own", async () => {
    const sidebar = await mountVocabularySidebar(types(["articles", 6]));
    expect(browseProfileName(sidebar)).toBe("newsroom");
    expect(sidebar.querySelector(".nav-section-head .nav-section-label")?.textContent).toBe(
      "BROWSE",
    );
  });

  it("states the true total once the list is capped", async () => {
    // A capped list cannot be counted by eye, so the header carries the figure
    // the rows no longer add up to (mockup: "research · 12").
    const sidebar = await mountVocabularySidebar(manyTypes(CAP + 1));
    expect(browseProfileName(sidebar)).toBe(`newsroom · ${CAP + 1}`);
  });
});

describe("more types than the cap", () => {
  it("marks the group capped and reports the residual as scrollable", async () => {
    const sidebar = await mountVocabularySidebar(manyTypes(CAP + 3));
    expect(sidebar.querySelector(".nav-type-group")?.className).toContain("is-capped");
    expect(sidebar.querySelector(".nav-type-residual")?.textContent).toBe("3 more · scroll");
  });

  it("keeps every type in the list — the cap is a scroll, not a truncation", async () => {
    const sidebar = await mountVocabularySidebar(manyTypes(CAP + 3));
    expect(typeRows(sidebar)).toHaveLength(CAP + 3);
  });

  it("offers All types, pointing at the screen that lists the full set", async () => {
    const sidebar = await mountVocabularySidebar(manyTypes(CAP + 1));
    const all = sidebar.querySelector(".nav-type-all");
    expect(all?.textContent).toBe("All types");
    expect(all?.getAttribute("href")).toBe("#/pipeline");
  });

  it("carries no data-route on All types, which is not a nav entry of its own", async () => {
    // It duplicates the MAINTAIN Pipeline destination; a second entry claiming
    // that route would steal the highlight from the real one.
    const sidebar = await mountVocabularySidebar(manyTypes(CAP + 1));
    expect(sidebar.querySelector(".nav-type-all")?.hasAttribute("data-route")).toBe(false);
  });
});

describe("at or below the cap", () => {
  it("shows no fade, no residual and no All types", async () => {
    const sidebar = await mountVocabularySidebar(manyTypes(CAP));
    expect(sidebar.querySelector(".nav-type-group")?.className).not.toContain("is-capped");
    expect(sidebar.querySelector(".nav-type-residual")).toBeNull();
    expect(sidebar.querySelector(".nav-type-all")).toBeNull();
  });

  it("still names the profile on the header, without a count", async () => {
    const sidebar = await mountVocabularySidebar(manyTypes(CAP));
    expect(browseProfileName(sidebar)).toBe("newsroom");
  });
});
