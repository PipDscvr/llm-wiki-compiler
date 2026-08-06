/**
 * @file examples/profile-newsroom/ts-loader.mjs
 * @description Module-resolution hook that lets `seed.mjs` import llmwiki's own
 * TypeScript sources directly, with no build step and no extra dependency.
 *
 * WHY this exists: the seed script must reuse the project's real writers — the
 * workflow lifecycle ops, the relation store, and `writeState` — rather than
 * hand-rolling their on-disk formats, so the example cannot silently rot when
 * one of them changes. A workflow run record in particular carries an integrity
 * HMAC over its own bytes, so a hand-written run file would not even be
 * readable. Those writers are not part of the published SDK surface
 * (`dist/index.js`), and the bundled `dist/cli.js` exports nothing, so importing
 * `src/**.ts` is the only way to reach them.
 *
 * Node 24 strips TypeScript types natively, so the ONLY thing missing is
 * specifier resolution: llmwiki's sources import siblings as `./foo.js`
 * (the TS/ESM convention) while only `./foo.ts` exists on disk. This hook
 * retries such a specifier with a `.ts` extension when — and only when — the
 * `.js` file genuinely does not exist, leaving every other resolution
 * (bare package names, real `.js` files, data URLs) to Node's default.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** True for a relative sibling import that llmwiki would write as `./x.js`. */
function isRelativeJsSpecifier(specifier) {
  return (
    specifier.endsWith(".js") &&
    (specifier.startsWith("./") || specifier.startsWith("../"))
  );
}

/** True when a resolved `file:` URL points at something that exists on disk. */
function resolvesToExistingFile(url) {
  if (!url.startsWith("file:")) return true;
  return existsSync(fileURLToPath(url));
}

/**
 * Node ESM `resolve` hook. Falls back to the `.ts` sibling only for a relative
 * `.js` specifier whose `.js` target is absent, so a project that later ships
 * real `.js` files alongside its sources keeps resolving to those.
 */
export async function resolve(specifier, context, nextResolve) {
  if (!isRelativeJsSpecifier(specifier)) return nextResolve(specifier, context);
  try {
    const resolved = await nextResolve(specifier, context);
    if (resolvesToExistingFile(resolved.url)) return resolved;
  } catch {
    // Fall through to the TypeScript sibling below.
  }
  return nextResolve(`${specifier.slice(0, -".js".length)}.ts`, context);
}
