/**
 * llmwiki viewer — the active profile's entity types, projected into nav rows.
 *
 * BROWSE is a projection of the profile's vocabulary rather than a fixed list:
 * "Concepts" was never a stable label, it is what the DEFAULT profile calls its
 * one entity type. A default project declares no `profilePipeline`, so this
 * module returns nothing for it and the sidebar's fixed rows stand — which is
 * what keeps today's default sidebar byte-for-byte where it was.
 *
 * Split out of viewer-sidebar.js because the ORDERING and LABELLING rules are
 * the part a profile author has to be able to predict, and they are worth
 * reading (and testing) without the DOM building around them.
 */

/**
 * Rows BROWSE shows before it caps the list.
 *
 * The cap is a SCROLL, not a truncation — every declared type stays in the DOM
 * and reachable — so this is the number of rows that stay in view, and anything
 * beyond it is reported as a residual count. Mirrored in viewer-chrome.css,
 * which derives the scroller's max-height from the same figure.
 */
export const NAV_TYPE_CAP = 11;

/**
 * A profile's entity type id as the nav says it out loud.
 *
 * Sentence case, not Title Case: the mockup renders `instrument_calibrations`
 * as "Instrument calibrations", so only the first letter is raised. The rest of
 * the identifier is left exactly as the profile spells it — provenance and lint
 * quote the literal id in mono, and a label that re-cased its interior would
 * stop being recognisably the same word.
 *
 * @param {string} type - The declared entity type id.
 * @returns {string} The nav label.
 */
export function navTypeLabel(type) {
  const words = String(type).replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Project the envelope's declared entity types into nav items, in the order
 * BROWSE lists them.
 *
 * Ordering is page count DESCENDING — the biggest type is where work happens —
 * with ties falling back to the order the PROFILE declares them, never
 * alphabetical, so an author can predict the result from their own file.
 * `profilePipeline.entityTypes` already arrives in declaration order (it is
 * built from `Object.entries(profile.entities)`), and `Array.prototype.sort` is
 * stable, so sorting by count alone gives exactly that. Nothing here re-sorts
 * by name.
 *
 * @param {{type?: string, pageCount?: number}[]} [entityTypes] - The envelope's
 *   `profilePipeline.entityTypes`, absent on a default project.
 * @returns {{route: string, href: string, label: string, title: string, countValue: number}[]}
 */
export function typeNavItems(entityTypes) {
  if (!Array.isArray(entityTypes)) return [];
  return entityTypes
    .filter((entry) => typeof entry?.type === "string" && entry.type.length > 0)
    .sort((a, b) => typePageCount(b) - typePageCount(a))
    .map(typeNavItem);
}

/** Build one type row's nav item. A zero count is kept, not dropped: a declared
 *  type with no pages still lists, because its absence is information. */
function typeNavItem(entry) {
  const label = navTypeLabel(entry.type);
  return {
    route: entry.type,
    href: `#/${encodeURIComponent(entry.type)}`,
    label,
    // The full text, kept for the `title` the truncating label carries.
    title: label,
    countValue: typePageCount(entry),
    isType: true,
  };
}

/** A type's valid-page count, with anything non-numeric read as none. */
function typePageCount(entry) {
  return typeof entry?.pageCount === "number" && entry.pageCount > 0 ? entry.pageCount : 0;
}
