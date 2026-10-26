import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The share images are drawn by next/og, which takes literal colours, not CSS variables.
 * Rather than repeat the palette here, this reads the active theme's light-mode values out
 * of src/styles/themes.css at build time, so the colours still live in one place.
 */

export const OG_TOKEN_NAMES = [
  "sign-panel",
  "sign-panel-foreground",
  "sign-panel-muted",
  "sign-panel-border",
  "lane-line",
] as const;

export type OgTokenName = (typeof OG_TOKEN_NAMES)[number];

/** The first :root block after "THEME 1 START" (the active theme), as name to value. */
export function parseActiveThemeTokens(css: string): Record<string, string> {
  const start = css.indexOf("==== THEME 1 START ====");
  if (start < 0) throw new Error("themes.css has no THEME 1 START marker");
  const rootStart = css.indexOf(":root {", start);
  const rootEnd = css.indexOf("}", rootStart);
  if (rootStart < 0 || rootEnd < 0) throw new Error("themes.css theme 1 has no :root block");
  const tokens: Record<string, string> = {};
  for (const match of css.slice(rootStart, rootEnd).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

let cached: Record<OgTokenName, string> | undefined;

export function ogTokens(): Record<OgTokenName, string> {
  if (cached) return cached;
  const css = readFileSync(join(process.cwd(), "src/styles/themes.css"), "utf8");
  const all = parseActiveThemeTokens(css);
  const picked = {} as Record<OgTokenName, string>;
  for (const name of OG_TOKEN_NAMES) {
    const value = all[name];
    if (!value || !/^#[0-9a-f]{3,8}$/i.test(value)) {
      throw new Error(`themes.css theme 1 --${name} must be a hex colour for the share images, got ${value}`);
    }
    picked[name] = value;
  }
  cached = picked;
  return picked;
}
