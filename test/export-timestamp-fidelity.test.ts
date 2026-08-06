/**
 * Export timestamp fidelity: `llmwiki export` must never invent a timestamp.
 *
 * The "field missing" branch is reachable in ordinary use — `llmwiki query
 * --save` writes `title`/`summary`/`type: "query"`/`createdAt` and no
 * `updatedAt` (src/commands/query-save.ts) — so a collector that fell back to
 * the export run's clock made two exports of an unchanged wiki differ, and the
 * invented instant reached every downstream format.
 *
 * The clock is FAKED and ADVANCED between the two collections rather than
 * left to wall time: two real calls can land inside the same millisecond and
 * agree by luck, which would let the regression back in unnoticed.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { rm } from "fs/promises";
import path from "path";
import { makeTempRoot } from "./fixtures/temp-root.js";
import { writePage } from "./fixtures/write-page.js";
import { buildFrontmatter } from "../src/utils/markdown.js";
import { collectExportPages } from "../src/export/collect.js";
import { buildLlmsTxt, buildLlmsFullTxt } from "../src/export/llms-txt.js";
import { buildJsonLd } from "../src/export/json-ld.js";
import { buildGraphml } from "../src/export/graphml.js";
import { buildMarp } from "../src/export/marp.js";
import { mapPageToOkfFrontmatter } from "../src/export/okf/mapping.js";
import type { ExportPage } from "../src/export/types.js";

/** Two wall-clock instants a year apart; the export must be indifferent to both. */
const FIRST_RUN = new Date("2026-03-01T00:00:00.000Z");
const SECOND_RUN = new Date("2027-09-09T09:09:09.000Z");

const CONCEPT_CREATED = "2024-01-01T00:00:00.000Z";
const CONCEPT_UPDATED = "2024-06-01T00:00:00.000Z";
const QUERY_CREATED = "2024-02-02T00:00:00.000Z";
const TITLE = "Fixture Wiki";

/** Exactly the frontmatter `query --save` writes: a top-level `type`, no `updatedAt`. */
const SAVED_QUERY = { title: "Why?", summary: "Because.", type: "query", createdAt: QUERY_CREATED };

/** Render every page's OKF frontmatter — the bundle's per-doc header, as bytes. */
function renderOkf(pages: ExportPage[]): string {
  return pages
    .map((page) => buildFrontmatter(mapPageToOkfFrontmatter(page) as unknown as Record<string, unknown>))
    .join("\n");
}

/**
 * The six formats the fabricated instant reached, each paired with its renderer
 * and with how that format spells a page's updated timestamp. One table so the
 * determinism check and the cross-format agreement check cannot drift apart.
 */
const AFFECTED_FORMATS: ReadonlyArray<{
  name: string;
  render: (pages: ExportPage[]) => string;
  updatedMarker: (timestamp: string) => string;
}> = [
  { name: "llms-txt", render: (p) => buildLlmsTxt(p, TITLE), updatedMarker: (t) => `updated: ${t}` },
  { name: "llms-full-txt", render: (p) => buildLlmsFullTxt(p, TITLE), updatedMarker: (t) => `Updated: ${t}` },
  { name: "marp", render: (p) => buildMarp(p, TITLE, "all"), updatedMarker: (t) => `updated: ${t}` },
  { name: "json-ld", render: buildJsonLd, updatedMarker: (t) => `"dateModified": "${t}"` },
  { name: "graphml", render: buildGraphml, updatedMarker: (t) => `<data key="updatedAt">${t}</data>` },
  { name: "okf", render: renderOkf, updatedMarker: (t) => `timestamp: "${t}"` },
];

let dir: string;
afterEach(async () => {
  vi.useRealTimers();
  if (dir) await rm(dir, { recursive: true, force: true });
});

/** Seed a wiki holding a fully-dated concept, an undated concept, and a saved query. */
async function seedWiki(): Promise<string> {
  dir = await makeTempRoot("export-ts");
  const concepts = path.join(dir, "wiki/concepts");
  const dated = { title: "Dated", summary: "s", createdAt: CONCEPT_CREATED, updatedAt: CONCEPT_UPDATED };
  await writePage(concepts, "dated", dated, "Body.");
  await writePage(concepts, "undated", { title: "Undated", summary: "s" }, "Body.");
  await writePage(path.join(dir, "wiki/queries"), "why", SAVED_QUERY, "Body.");
  return dir;
}

/** Collect the wiki with the system clock pinned to `at`. */
async function collectAt(root: string, at: Date): Promise<ExportPage[]> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  return collectExportPages(root);
}

/** The collected page for `slug` (the fixture always yields it). */
function pageOf(pages: ExportPage[], slug: string): ExportPage {
  return pages.find((page) => page.slug === slug)!;
}

describe("export timestamps are read, never invented", () => {
  it("keeps a page's declared createdAt and updatedAt verbatim", async () => {
    const pages = await collectAt(await seedWiki(), FIRST_RUN);
    expect(pageOf(pages, "dated")).toMatchObject({
      createdAt: CONCEPT_CREATED,
      updatedAt: CONCEPT_UPDATED,
    });
  });

  it("dates a saved query by its own createdAt, not by the export run", async () => {
    const pages = await collectAt(await seedWiki(), FIRST_RUN);
    expect(pageOf(pages, "why")).toMatchObject({
      createdAt: QUERY_CREATED,
      updatedAt: QUERY_CREATED,
    });
  });

  it("leaves both timestamps empty for a page that declares neither", async () => {
    const pages = await collectAt(await seedWiki(), FIRST_RUN);
    expect(pageOf(pages, "undated")).toMatchObject({ createdAt: "", updatedAt: "" });
  });

  it("collects identical pages across a clock jump", async () => {
    const root = await seedWiki();
    const first = await collectAt(root, FIRST_RUN);
    const second = await collectAt(root, SECOND_RUN);
    expect(first).toEqual(second);
  });

  it("renders byte-identical output in every format across a clock jump", async () => {
    const root = await seedWiki();
    const first = await collectAt(root, FIRST_RUN);
    const second = await collectAt(root, SECOND_RUN);
    // Render both lists at ONE instant: llms.txt and marp deliberately stamp
    // "exported at" into their headers, so holding the render clock still leaves
    // the collected page data as the only variable under test.
    vi.setSystemTime(SECOND_RUN);
    for (const { name, render } of AFFECTED_FORMATS) {
      expect(render(first), name).toBe(render(second));
    }
  });

  it("agrees on a saved query's updated timestamp across every affected format", async () => {
    const pages = await collectAt(await seedWiki(), FIRST_RUN);
    const query = [pageOf(pages, "why")];
    for (const { name, render, updatedMarker } of AFFECTED_FORMATS) {
      expect(render(query), name).toContain(updatedMarker(QUERY_CREATED));
    }
  });

  it("types a saved query as an OKF query and a concept as a concept", async () => {
    const pages = await collectAt(await seedWiki(), FIRST_RUN);
    expect(mapPageToOkfFrontmatter(pageOf(pages, "why")).type).toBe("query");
    expect(mapPageToOkfFrontmatter(pageOf(pages, "dated")).type).toBe("concept");
  });

  it("omits the OKF timestamp entirely for a page that declares none", async () => {
    const pages = await collectAt(await seedWiki(), FIRST_RUN);
    expect(mapPageToOkfFrontmatter(pageOf(pages, "undated")).timestamp).toBeUndefined();
  });
});
