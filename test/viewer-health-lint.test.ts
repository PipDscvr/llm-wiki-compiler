/**
 * DOM-level tests for the `#/health` route's Lint panel.
 *
 * The panel is the largest object on the health screen: total figures, a
 * stacked proportion bar with a legend, a row-per-rule table, and a footer
 * naming the highest-leverage rule. Every one of those is derived from
 * `lint.rules[]` (persisted by the linter's cache), so a payload without a
 * lint cache at all must degrade to the placeholder rather than render an
 * empty table — asserted explicitly below.
 */

import { describe, expect, it } from "vitest";
import {
  conceptPage,
  pagesEnvelope,
  renderHealthRoute,
  textOf,
  type Payload,
} from "./fixtures/viewer-health-fixture.js";

/** Two rules with a deliberately lopsided 3:1 split, so proportions are checkable. */
const LINT: Payload = {
  warnings: 5,
  errors: 15,
  at: "2026-08-05T19:01:00.000Z",
  rules: [
    { rule: "broken-wikilink", severity: "error", count: 15, fileCount: 3, topFile: "wiki/concepts/alpha.md", topFileCount: 11 },
    { rule: "missing-summary", severity: "warning", count: 5, fileCount: 5, topFile: "wiki/concepts/beta.md", topFileCount: 1 },
  ],
};

/** A pages envelope containing the two concept pages the rules above point at. */
const PAGES = pagesEnvelope([conceptPage("alpha"), conceptPage("beta")]);

/** Render the health route with a lint cache attached to an otherwise clean wiki. */
function withLint(lint: Payload | null, pages = PAGES): Promise<HTMLElement> {
  return renderHealthRoute({ concepts: 2, queries: 0, sourceFiles: 1, sources: 1, lint }, pages);
}

/** Read the rendered rule rows' cells for one column class. */
function column(main: HTMLElement, cls: string): string[] {
  return [...main.querySelectorAll(`.lint-row:not(.is-head) ${cls}`)].map(
    (n) => n.textContent?.trim() ?? "",
  );
}

describe("lint panel — headline totals", () => {
  it("chips the combined problem count and prints both figures", async () => {
    const main = await withLint(LINT);
    expect(textOf(main, ".lint-chip")).toBe("20 PROBLEMS");
    expect(textOf(main, ".lint-figure.is-errors")).toBe("15");
    expect(textOf(main, ".lint-figure.is-warnings")).toBe("5");
  });

  it("pluralizes the figure labels against their own counts", async () => {
    const main = await withLint({ ...LINT, errors: 1, warnings: 1 });
    const labels = [...main.querySelectorAll(".lint-figure-label")].map((n) => n.textContent);
    expect(labels).toEqual(["error", "warning"]);
  });

  it("marks the panel warm only while problems remain", async () => {
    expect((await withLint(LINT)).querySelector("[data-lint-panel]")?.className).toContain("has-problems");
    const clean = await withLint({ warnings: 0, errors: 0, at: LINT.at, rules: [] });
    expect(clean.querySelector("[data-lint-panel]")?.className).not.toContain("has-problems");
  });
});

describe("lint panel — stacked proportion bar and legend", () => {
  it("sizes one segment per rule in proportion to its share of the total", async () => {
    const main = await withLint(LINT);
    const widths = [...main.querySelectorAll(".lint-bar-seg")].map((n) => (n as HTMLElement).style.width);
    expect(widths).toEqual(["75%", "25%"]);
  });

  it("ranks segments so each rule takes the next colour in the palette", async () => {
    const main = await withLint(LINT);
    const ranks = [...main.querySelectorAll(".lint-bar-seg")].map((n) => n.getAttribute("data-rank"));
    expect(ranks).toEqual(["0", "1"]);
  });

  it("labels each legend entry with its rule name and count", async () => {
    const main = await withLint(LINT);
    const legend = [...main.querySelectorAll(".lint-legend-item")].map((n) => n.textContent?.trim());
    expect(legend).toEqual(["broken-wikilink 15", "missing-summary 5"]);
  });
});

describe("lint panel — one table row per rule", () => {
  it("renders a row per rule, naming each rule and its count", async () => {
    const main = await withLint(LINT);
    expect(main.querySelectorAll(".lint-row:not(.is-head)")).toHaveLength(2);
    expect(column(main, ".lint-rule")).toEqual(["broken-wikilink", "missing-summary"]);
    expect(column(main, ".lint-count")).toEqual(["15", "5"]);
  });

  it("names the dominant file and its share when one page carries most findings", async () => {
    const main = await withLint(LINT);
    expect(column(main, ".lint-affected")[0]).toBe("alpha · 11 of 15");
  });

  it("names the file alone when it is the only one a rule flagged", async () => {
    const rules = [{ ...(LINT.rules as Payload[])[0], fileCount: 1, topFileCount: 15 }];
    const main = await withLint({ ...LINT, rules });
    expect(column(main, ".lint-affected")).toEqual(["alpha"]);
  });

  it("counts the files instead when a rule is spread across many", async () => {
    const main = await withLint(LINT);
    expect(column(main, ".lint-affected")[1]).toBe("5 files");
  });
});

describe("lint panel — the FIX cell navigates only to routes that exist", () => {
  it("links the most-affected page when its path maps to a real page route", async () => {
    const main = await withLint(LINT);
    const link = main.querySelector(".lint-row:not(.is-head) a.lint-fix");
    expect(link?.getAttribute("href")).toBe("#/concepts/alpha");
    expect(link?.textContent).toBe("view →");
  });

  it("renders plain text when the flagged file is not a wiki page", async () => {
    const rules = [{ ...(LINT.rules as Payload[])[0], topFile: ".llmwiki/journal.json" }];
    const main = await withLint({ ...LINT, rules });
    expect(main.querySelector(".lint-row:not(.is-head) a.lint-fix")).toBeNull();
    expect(column(main, ".lint-fix")).toEqual(["—"]);
  });

  it("renders plain text when the path looks routable but no such page exists", async () => {
    const rules = [{ ...(LINT.rules as Payload[])[0], topFile: "wiki/concepts/ghost.md" }];
    const main = await withLint({ ...LINT, rules });
    expect(main.querySelector(".lint-row:not(.is-head) a.lint-fix")).toBeNull();
  });
});

describe("lint panel — footer insight", () => {
  it("names the dominant rule's share and links onward to the graph explorer", async () => {
    const main = await withLint(LINT);
    expect(textOf(main, ".lint-insight")).toBe("15 of 20 problems come from broken-wikilink.");
    expect(main.querySelector(".lint-action")?.getAttribute("href")).toBe("#/graph");
  });

  it("omits the footer band entirely on a clean run", async () => {
    const main = await withLint({ warnings: 0, errors: 0, at: LINT.at, rules: [] });
    expect(main.querySelector(".lint-footer")).toBeNull();
    expect(main.querySelector(".lint-row:not(.is-head)")).toBeNull();
  });
});

describe("lint panel — degrades when lint has never run", () => {
  it("shows the run-lint placeholder instead of an empty table", async () => {
    const main = await withLint(null);
    expect(textOf(main, "[data-lint-panel] .placeholder")).toBe(
      "No cached lint summary yet — run `llmwiki lint`.",
    );
  });

  it("renders no table, bar, chip or footer without a lint cache", async () => {
    const main = await withLint(null);
    for (const sel of [".lint-row", ".lint-bar", ".lint-chip", ".lint-footer", ".lint-figure"]) {
      expect(main.querySelector(sel), sel).toBeNull();
    }
  });

  it("keeps the panel and its title so the screen's layout does not collapse", async () => {
    const main = await withLint(null);
    expect(main.querySelector("[data-lint-panel]")).not.toBeNull();
    expect(textOf(main, "[data-lint-panel] .panel-title")).toBe("Lint");
  });
});
