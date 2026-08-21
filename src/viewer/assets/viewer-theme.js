/**
 * llmwiki viewer — theme toggle wiring.
 *
 * Pre-paint resolution lives in viewer-theme-boot.js (a classic script in
 * <head>); this module only wires the header button once the DOM exists. It
 * reads the current value off <html> rather than re-deriving it, so the two
 * files cannot disagree about precedence.
 *
 * A localStorage write that throws (private mode, storage disabled) degrades
 * to a session-only theme change rather than breaking the button.
 */

const STORAGE_KEY = "llmwiki-viewer-theme";
const TOGGLE_SELECTOR = "[data-theme-toggle]";

/** Icon markup per theme, expressed as the label of the theme it switches TO. */
const TOGGLE_LABELS = {
  dark: "Switch to light theme",
  light: "Switch to dark theme",
};

/** Read the theme currently stamped on <html>, defaulting to dark. */
function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Persist the theme, ignoring storage failures. */
function persistTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Session-only theme change is an acceptable degradation.
  }
}

/** Apply a theme to the document and update the button's accessible label. */
function applyTheme(theme, button) {
  document.documentElement.dataset.theme = theme;
  button.setAttribute("aria-label", TOGGLE_LABELS[theme]);
  button.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
  button.dataset.themeToggle = theme;
}

/**
 * Wire the header theme toggle. Safe to call when the button is absent
 * (the shell is shared with tests that strip chrome).
 */
export function wireThemeToggle() {
  const button = document.querySelector(TOGGLE_SELECTOR);
  if (!button) return;
  applyTheme(currentTheme(), button);
  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    persistTheme(next);
    applyTheme(next, button);
  });
}
