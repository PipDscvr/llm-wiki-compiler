/**
 * llmwiki viewer — pre-paint theme resolution.
 *
 * Loaded as a CLASSIC <script> in <head>, ahead of the stylesheets. It cannot
 * be a module (`type="module"` defers, producing a flash of the wrong theme)
 * and it cannot be inline (the viewer's CSP omits 'unsafe-inline' from
 * script-src). It therefore ships as its own file and declares no exports.
 *
 * Resolution order: stored preference -> OS preference -> dark. The result is
 * stamped on <html> as `data-theme`, which viewer-tokens.css keys off.
 *
 * `window.__llmwikiResolveTheme` is exposed so viewer-theme.js and the test
 * harness can re-run resolution without duplicating the precedence rules.
 */

(function () {
  var STORAGE_KEY = "llmwiki-viewer-theme";

  /** Read the stored theme, tolerating disabled or throwing localStorage. */
  function storedTheme() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (err) {
      return null;
    }
  }

  /** Resolve stored -> OS -> dark and stamp the result on <html>. */
  function resolveTheme() {
    var stored = storedTheme();
    if (stored) {
      document.documentElement.dataset.theme = stored;
      return stored;
    }
    var prefersLight =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: light)").matches;
    var resolved = prefersLight ? "light" : "dark";
    document.documentElement.dataset.theme = resolved;
    return resolved;
  }

  window.__llmwikiThemeStorageKey = STORAGE_KEY;
  window.__llmwikiResolveTheme = resolveTheme;
  resolveTheme();
})();
