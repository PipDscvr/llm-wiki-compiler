/**
 * llmwiki viewer — shared DOM element builders.
 *
 * Every render module builds its DOM through these four helpers rather than
 * hand-rolling `document.createElement` chains. Centralising them keeps the
 * render modules short and, more importantly, keeps text insertion on
 * `textContent` — the server is the only component permitted to produce
 * markup, and it sanitises before doing so.
 *
 * No module in this bundle may set `innerHTML` on content it did not receive
 * from the server's sanitised `html` field.
 */

/**
 * Build an element with an optional class and text content.
 *
 * @param {string} tag - Tag name.
 * @param {string} [className] - Class attribute; omitted entirely when absent.
 * @param {string} [text] - Text content, inserted via textContent.
 * @returns {HTMLElement}
 */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Build a heading element.
 *
 * @param {string} tag - Heading tag, e.g. "h1".
 * @param {string} text - Heading text.
 * @returns {HTMLElement}
 */
export function heading(tag, text) {
  return el(tag, undefined, text);
}

/**
 * Build the standard italic placeholder paragraph used for empty states.
 *
 * @param {string} text - Message to display.
 * @returns {HTMLElement}
 */
export function placeholder(text) {
  return el("p", "placeholder", text);
}

/**
 * Build a `<dl>` from `[label, value]` pairs. Values are stringified, so
 * numeric counts can be passed directly.
 *
 * @param {Array<[string, unknown]>} rows - Label/value pairs.
 * @returns {HTMLElement}
 */
export function definitionList(rows) {
  const list = el("dl");
  for (const [label, value] of rows) {
    list.appendChild(el("dt", undefined, label));
    list.appendChild(el("dd", undefined, String(value)));
  }
  return list;
}

/**
 * Build the design system's empty state: a dashed-border card that teaches the
 * concept and, where one exists, gives the exact command to fix it.
 *
 * Italic placeholder text is NOT an empty state — it says a surface is blank
 * without saying what would fill it. Use `placeholder` only for transient
 * loading text.
 *
 * @param {string} title - What is missing, stated plainly.
 * @param {string} body - Why the surface exists and what would fill it.
 * @param {string} [command] - The exact CLI command, lowercase.
 * @returns {HTMLElement}
 * @expected-unused Not yet called from viewer.js; later render modules
 *   (Tasks 6-9 of the nebula-viewer-ui plan) use this for genuinely-empty
 *   surfaces. Fallow should flag this tag as stale once one does — that is
 *   the intended cue to remove it.
 */
export function emptyState(title, body, command) {
  const wrap = el("div", "empty-state");
  wrap.appendChild(el("div", "empty-state-title", title));
  wrap.appendChild(el("div", "empty-state-body", body));
  if (command) wrap.appendChild(el("div", "empty-state-command", command));
  return wrap;
}
