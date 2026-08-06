/**
 * Frontmatter field readers shared by every viewer surface that needs a page's
 * timestamp or its display kind.
 *
 * These exist because the two halves of the system spell the same two concepts
 * differently. The compiler (`src/compiler/page-renderer.ts`,
 * `src/compiler/seed-pages.ts`) stamps `kind` + `createdAt` + `updatedAt`, but
 * `llmwiki query --save` (`src/commands/query-save.ts`) writes only `title`,
 * `summary`, `type: "query"` and `createdAt`. A viewer that reads `kind` and
 * `updatedAt` alone therefore renders every genuinely-saved query with a blank
 * age, a wrong "concept" label, and a permanent last place in the recent list.
 *
 * The reader reconciles the two spellings rather than the writer, because
 * `createdAt`-only query pages already exist on disk in every wiki compiled to
 * date; changing the writer would leave all of them broken. Both readers live
 * here — one per concept — so a future field divergence has exactly one place
 * to be handled instead of four copies of a `??` to keep in sync.
 */

/** Display kind used when a page declares neither `kind` nor `type`. */
const DEFAULT_KIND = "concept";

/** Read `key` from `frontmatter` when it holds a non-empty string. */
function readNonEmptyString(frontmatter: Record<string, unknown>, key: string): string | undefined {
  const value = frontmatter[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The timestamp a page should be aged and ranked by: `updatedAt` when present,
 * otherwise `createdAt`.
 *
 * The fallback is semantically sound rather than a fudge. `query-save.ts`
 * stamps a FRESH `createdAt` on every save and writes through `atomicWrite`,
 * which overwrites in place — so on a saved query `createdAt` genuinely records
 * when the file was last written, which is exactly what `updatedAt` means on a
 * compiled concept.
 *
 * A page carrying neither field yields `""`, preserving the documented
 * degrade-safely behaviour: empty strings sort last under `localeCompare` and
 * render as an empty age rather than crashing the row.
 *
 * @param frontmatter - Parsed page frontmatter.
 * @returns An ISO timestamp string, or `""` when the page declares none.
 */
export function pageTimestamp(frontmatter: Record<string, unknown>): string {
  return readNonEmptyString(frontmatter, "updatedAt")
    ?? readNonEmptyString(frontmatter, "createdAt")
    ?? "";
}

/**
 * The page's display kind: `kind` when present, otherwise `type`.
 *
 * `type` is safe as a fallback because no other wiki-page writer emits a
 * TOP-LEVEL `type` key — the compiler, the seed-page writer and the OKF
 * importer all stamp `kind` (the importer parks a foreign OKF `type` inside its
 * nested `x-okf` block, never at the top level). A top-level `type` on a wiki
 * page is therefore the saved-query marker and nothing else, so honouring it
 * labels saved queries correctly without mislabelling any other page.
 *
 * @param frontmatter - Parsed page frontmatter.
 * @returns The resolved kind, defaulting to `"concept"`.
 */
export function resolvePageKind(frontmatter: Record<string, unknown>): string {
  return readNonEmptyString(frontmatter, "kind")
    ?? readNonEmptyString(frontmatter, "type")
    ?? DEFAULT_KIND;
}
