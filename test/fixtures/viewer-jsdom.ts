/**
 * Mount the viewer's static assets into a JSDOM instance for DOM-level tests.
 *
 * JSDOM's `eval` does not drive ES-module loading, so every
 * `src/viewer/assets/viewer-*.js` module is wrapped in an IIFE, its named
 * exports collected, and the result registered on
 * `window.__viewerModules["./<name>.js"]`. Static `import` lines in each
 * module (and in the `viewer.js` entry point) are rewritten into registry
 * reads. Discovery is by directory scan, so adding a client module requires
 * no change here.
 *
 * `viewer-graph.js` is stubbed rather than evaluated — D3 is not exercised
 * under JSDOM. `viewer-theme-boot.js` is a classic script and is evaluated
 * verbatim before the modules, matching its `<head>` position in the shell.
 *
 * Test fixtures pass a fetch responder; unmatched URLs fall through to 404 so
 * a test that forgot to wire an endpoint fails loudly rather than silently
 * producing an empty UI.
 */

import { readFile, readdir } from "fs/promises";
import path from "path";
import { JSDOM, VirtualConsole } from "jsdom";
import { vi } from "vitest";

const ASSETS_DIR = path.resolve("src/viewer/assets");
const SHELL_PATH = path.join(ASSETS_DIR, "index.html");
const ENTRY_SCRIPT = "viewer.js";
const THEME_BOOT_SCRIPT = "viewer-theme-boot.js";

/**
 * Modules whose evaluation order matters because they import each other.
 * Anything not listed here is appended afterwards in directory order.
 *
 * `viewer-format.js` has no imports of its own (pure functions, no DOM
 * access) but is imported by several other modules, including
 * `viewer-dashboard.js` — whose name sorts alphabetically BEFORE
 * "viewer-format.js", so directory order alone would evaluate the
 * dependent first and crash destructuring an undefined registry entry.
 * Pinning it here (like viewer-dom.js and viewer-theme.js) guarantees it
 * registers before any dependent regardless of filename.
 */
const MODULE_ORDER = ["viewer-dom.js", "viewer-format.js", "viewer-theme.js"];

/** Match `import { a, b } from "./viewer-x.js";` including multi-line forms. */
const IMPORT_PATTERN = /import\s*\{([\s\S]*?)\}\s*from\s*['"](\.\/[\w.-]+\.js)['"]\s*;/g;

/** Rewrite every static import into a read from the module registry. */
function rewriteImports(source: string): string {
  return source.replace(
    IMPORT_PATTERN,
    (_match, names: string, specifier: string) =>
      `const {${names}} = window.__viewerModules[${JSON.stringify(specifier)}];`,
  );
}

/**
 * Match a top-level `export` declaration and capture the exported name.
 *
 * WHY strip exports at all: JSDOM's `eval` does not drive ES-module
 * loading, so a bare `export` keyword is a `SyntaxError` outside a real
 * `<script type="module">`. Every viewer-*.js module is therefore
 * stripped of its `export` keywords before being eval'd (see
 * `stripExportKeyword`, which reuses this exact pattern so "what counts
 * as an export" can never drift between matching and stripping) and
 * wrapped in an IIFE.
 *
 * Supported forms: `function`, `async function`, `const`, `let`, `var`,
 * `class` — every form a viewer module currently uses (`viewer-graph.js`
 * ships `export async function`) plus the forms most likely for a future
 * module (e.g. `export const foo = () => {}`). `export default` and
 * re-export (`export { a, b }`) are NOT supported: a module using either
 * fails loudly via `assertNoUnsupportedExports` below instead of
 * producing a cryptic `SyntaxError: Unexpected token 'export'` from
 * JSDOM with no pointer back to the cause.
 */
const EXPORT_PATTERN = /export\s+(?:async\s+function|function|const|let|var|class)\s+(\w+)/g;

/** A line whose first token is `export` — one EXPORT_PATTERN did not match and strip. */
const UNSTRIPPED_EXPORT_PATTERN = /^[ \t]*export\b.*$/m;

/** Collect the names a module exports (see EXPORT_PATTERN for supported forms). */
function exportedNames(source: string): string[] {
  return Array.from(source.matchAll(EXPORT_PATTERN)).map((m) => m[1]);
}

/** Strip the leading `export` keyword from every declaration EXPORT_PATTERN matches. */
function stripExportKeyword(source: string): string {
  return source.replace(EXPORT_PATTERN, (declaration) => declaration.replace(/^export\s+/, ""));
}

/**
 * Throw a diagnostic naming the module and the offending line when a
 * module uses an export form EXPORT_PATTERN does not recognise (e.g.
 * `export default`, `export { a, b }`). Without this check, the orphaned
 * `export` keyword reaches JSDOM's `eval` and fails with a bare
 * `SyntaxError: Unexpected token 'export'` that names neither the module
 * nor the line — this turns that into an actionable error instead.
 */
function assertNoUnsupportedExports(strippedBody: string, specifier: string): void {
  const match = strippedBody.match(UNSTRIPPED_EXPORT_PATTERN);
  if (!match) return;
  throw new Error(
    `${specifier} uses an export form the JSDOM harness does not support: "${match[0].trim()}". ` +
      "Supported forms: function, async function, const, let, var, class " +
      "(see EXPORT_PATTERN in test/fixtures/viewer-jsdom.ts).",
  );
}

/**
 * Wrap a module in an IIFE that returns its exports and assign it into the
 * registry. The IIFE gives each module its own scope, so module-level `let`
 * state (e.g. the sidebar's active filter) cannot leak between modules.
 */
function moduleToRegistryScript(source: string, specifier: string): string {
  const names = exportedNames(source);
  const body = stripExportKeyword(rewriteImports(source));
  assertNoUnsupportedExports(body, specifier);
  const literal = names.map((name) => `${name}: ${name}`).join(", ");
  return `window.__viewerModules[${JSON.stringify(specifier)}] = (function () {\n${body}\nreturn { ${literal} };\n})();`;
}

/** List the client modules to mount, honouring MODULE_ORDER first. */
async function listModuleFiles(): Promise<string[]> {
  const entries = await readdir(ASSETS_DIR);
  const modules = entries.filter(
    (name) =>
      name.startsWith("viewer-") &&
      name.endsWith(".js") &&
      name !== THEME_BOOT_SCRIPT,
  );
  const ordered = MODULE_ORDER.filter((name) => modules.includes(name));
  const rest = modules.filter((name) => !ordered.includes(name)).sort();
  return [...ordered, ...rest];
}

/** Read a file from the assets dir, returning null when it does not exist. */
async function readOptional(name: string): Promise<string | null> {
  try {
    return await readFile(path.join(ASSETS_DIR, name), "utf-8");
  } catch {
    return null;
  }
}

/** Page row shape the shell's `<script id="page-index">` blob carries. */
export interface EmbeddedPage {
  id: string;
  pageDirectory: "concepts" | "queries";
  slug: string;
  title: string;
  /** Frontmatter `kind` — used by the sidebar to group concepts on first paint. */
  kind?: string;
}

/** Fetch responder: returns a Response or `null` to fall through to 404. */
export type FetchResponder = (url: string) => Response | Promise<Response> | null | undefined;

export interface MountResult {
  dom: JSDOM;
  fetchMock: ReturnType<typeof vi.fn>;
  flush(): Promise<void>;
}

/**
 * Mount the viewer shell + scripts into JSDOM. Returns the dom and a
 * fetch-mock spy so tests can assert what was called. After mount, the
 * promise has been flushed past the initial microtask cycle.
 *
 * @param startHash - Optional initial `location.hash` value (e.g. `"#/graph"`).
 *   Set before scripts run so `main()` sees this hash as the entry route.
 */
export async function mountViewerDom(
  pages: EmbeddedPage[],
  responder: FetchResponder,
  startHash?: string,
): Promise<MountResult> {
  const [shell, entrySrc, moduleFiles] = await Promise.all([
    readFile(SHELL_PATH, "utf-8"),
    readFile(path.join(ASSETS_DIR, ENTRY_SCRIPT), "utf-8"),
    listModuleFiles(),
  ]);
  const html = embedPageIndex(shell, pages);
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const response = await responder(url);
    return response ?? new Response(null, { status: 404 });
  });
  const startUrl = startHash ? `http://127.0.0.1:0/${startHash}` : "http://127.0.0.1:0/";
  const dom = new JSDOM(html, {
    url: startUrl,
    runScripts: "outside-only",
    virtualConsole: new VirtualConsole(),
  });
  (dom.window as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
  dom.window.eval("window.__viewerModules = {};");
  // D3 is not exercised under JSDOM; stub the graph module before anything imports it.
  dom.window.eval(
    'window.__viewerModules["./viewer-graph.js"] = { loadGraph: async function () {} };',
  );
  const themeBoot = await readOptional(THEME_BOOT_SCRIPT);
  if (themeBoot) dom.window.eval(themeBoot);
  for (const name of moduleFiles) {
    if (name === "viewer-graph.js") continue;
    const source = await readOptional(name);
    if (source === null) continue;
    dom.window.eval(moduleToRegistryScript(source, `./${name}`));
  }
  dom.window.eval(rewriteImports(entrySrc));
  await flushMicrotasks();
  return { dom, fetchMock, flush: flushMicrotasks };
}

/** Drop a JSON-escaped page-index blob into the shell template marker. */
function embedPageIndex(shell: string, pages: EmbeddedPage[]): string {
  const json = JSON.stringify({ pages }).replace(/</g, "\\u003c");
  return shell.replace(
    "<!--PAGE_INDEX-->",
    `<script type="application/json" id="page-index">${json}</script>`,
  );
}

/** Standard JSON 200 helper for fetch responders. */
export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Settle microtasks (the initial /api/pages fetch + render). */
export function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}
