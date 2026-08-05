/**
 * WCAG contrast floors for the Nebula palette.
 *
 * The design mockup is a static image and says nothing about contrast. The
 * muted-on-muted pairs are the ones at risk: section eyebrows on the sidebar
 * and the alert card's sub-line on its tinted fill. Both must clear AA for
 * their size class or the token values need darkening.
 */

import { describe, expect, it } from "vitest";
import { readFile } from "fs/promises";
import path from "path";

const TOKENS = path.resolve("src/viewer/assets/viewer-tokens.css");

/** Relative luminance of an #rrggbb colour, per WCAG 2.1. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** Contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Read a token's value from a given theme block in the tokens stylesheet. */
async function token(name: string, theme: "dark" | "light"): Promise<string> {
  const css = await readFile(TOKENS, "utf-8");
  const blockStart =
    theme === "dark" ? css.indexOf(":root {") : css.indexOf(':root[data-theme="light"]');
  const block = css.slice(blockStart, css.indexOf("}", blockStart));
  const match = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token ${name} not found in the ${theme} block`);
  return match[1];
}

/** Pairs that must clear the WCAG AA large-text floor of 3:1. */
const LARGE_TEXT_PAIRS: [string, string][] = [
  ["--fg-ghost", "--bg-sidebar"],
  ["--fg-faint", "--bg-card"],
  ["--warn-muted", "--warn-bg"],
];

/** Pairs that must clear the WCAG AA body-text floor of 4.5:1. */
const BODY_TEXT_PAIRS: [string, string][] = [
  ["--fg-body", "--bg-card"],
  ["--fg-muted", "--bg-card"],
  ["--fg", "--bg-shell"],
];

describe.each(["dark", "light"] as const)("%s theme contrast", (theme) => {
  it.each(LARGE_TEXT_PAIRS)("%s on %s clears 3:1", async (fg, bg) => {
    const ratio = contrast(await token(fg, theme), await token(bg, theme));
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it.each(BODY_TEXT_PAIRS)("%s on %s clears 4.5:1", async (fg, bg) => {
    const ratio = contrast(await token(fg, theme), await token(bg, theme));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
