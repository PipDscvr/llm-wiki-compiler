/**
 * Compact graph mode.
 *
 * The dashboard panel renders a real graph, not a decorative picture, so it
 * shares one fetch path and one simulation builder with #/graph. Compact
 * mode is options-only — it must never become a second renderer. The last
 * test pins full mode's own numbers (unchanged since before this file
 * existed) so a future compact-mode tweak cannot silently shift them too.
 */

import { describe, expect, it } from "vitest";
import { readFile } from "fs/promises";
import path from "path";

const GRAPH_MODULE = path.resolve("src/viewer/assets/viewer-graph.js");
const DASHBOARD_MODULE = path.resolve("src/viewer/assets/viewer-dashboard.js");

describe("compact graph mode", () => {
  it("accepts an options argument on loadGraph", async () => {
    const source = await readFile(GRAPH_MODULE, "utf-8");
    expect(source).toMatch(/export\s+async\s+function\s+loadGraph\s*\(\s*container\s*,\s*options/);
  });

  it("keeps a single fetch path", async () => {
    const source = await readFile(GRAPH_MODULE, "utf-8");
    const fetches = source.match(/fetch\(/g) ?? [];
    expect(fetches).toHaveLength(1);
  });

  it("keeps a single force-simulation builder", async () => {
    const source = await readFile(GRAPH_MODULE, "utf-8");
    const sims = source.match(/forceSimulation\(/g) ?? [];
    expect(sims).toHaveLength(1);
  });

  it("skips the legend in compact mode", async () => {
    const source = await readFile(GRAPH_MODULE, "utf-8");
    expect(source).toMatch(/if\s*\(\s*!\s*options\.compact\s*\)\s*buildLegend/);
  });

  it("has the dashboard render into the graph panel", async () => {
    const source = await readFile(DASHBOARD_MODULE, "utf-8");
    expect(source).toContain("loadGraph");
    expect(source).toContain("compact: true");
  });

  it("keeps full mode's forces and radii at their pre-compact values", async () => {
    const source = await readFile(GRAPH_MODULE, "utf-8");
    expect(source).toMatch(
      /full:\s*\{\s*linkDistance:\s*80,\s*charge:\s*-200,\s*minRadius:\s*4,\s*maxRadius:\s*10,\s*drag:\s*true\s*\}/,
    );
  });
});
