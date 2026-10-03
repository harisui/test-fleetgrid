import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Parses src/styles/themes.css for the token tests. The file is split by marker
 * lines (`/* ==== THEME 1 START ==== *\/` and so on). A theme section is either
 * live CSS or one block comment wrapping the same CSS.
 */

export type Block = Record<string, string>;

export interface ParsedTheme {
  number: number;
  name: string;
  active: boolean;
  root: Block;
  dark: Block;
}

export interface ParsedThemes {
  source: string;
  shared: { root: Block; dark: Block; reducedMotion: Block };
  themes: ParsedTheme[];
}

export const THEMES_CSS_PATH = resolve(process.cwd(), "src/styles/themes.css");

const COMMENT = /\/\*[\s\S]*?\*\//g;

export function sectionOf(source: string, name: string): string {
  const startMarker = `/* ==== ${name} START ==== */`;
  const endMarker = `/* ==== ${name} END ==== */`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`themes.css is missing the ${name} START/END markers`);
  }
  return source.slice(start + startMarker.length, end);
}

/** Declarations of the first `selector { ... }` block in the CSS, or null. */
export function parseBlock(css: string, selector: string): Block | null {
  const escaped = selector.replace(/[.()]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) return null;
  const block: Block = {};
  for (const declaration of match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    block[declaration[1]] = declaration[2].trim();
  }
  return block;
}

/** True when the whole section is one block comment (a theme that is switched off). */
export function isCommentedOut(section: string): boolean {
  const trimmed = section.trim();
  return (
    trimmed.startsWith("/*") &&
    trimmed.endsWith("*/") &&
    trimmed.indexOf("*/") === trimmed.length - 2
  );
}

function themeCss(section: string): string {
  const trimmed = section.trim();
  return isCommentedOut(trimmed) ? trimmed.slice(2, -2) : trimmed.replace(COMMENT, "");
}

export function parseThemesCss(source = readFileSync(THEMES_CSS_PATH, "utf8")): ParsedThemes {
  const shared = sectionOf(source, "SHARED").replace(COMMENT, "");
  const reducedMotionMedia = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\})\s*\}/.exec(
    shared,
  );
  const themes: ParsedTheme[] = [];
  for (let number = 1; ; number++) {
    if (!source.includes(`/* ==== THEME ${number} START ==== */`)) break;
    const section = sectionOf(source, `THEME ${number}`);
    const nameMatch = /THEME \d+: ([A-Z][A-Z ]*?)(?: \(ACTIVE\))?\n/.exec(section);
    const css = themeCss(section);
    const root = parseBlock(css, ":root");
    const dark = parseBlock(css, ".dark");
    if (!root || !dark) throw new Error(`Theme ${number} needs both :root and .dark blocks`);
    themes.push({
      number,
      name: nameMatch?.[1] ?? `THEME ${number}`,
      active: !isCommentedOut(section),
      root,
      dark,
    });
  }
  return {
    source,
    shared: {
      root: parseBlock(shared, ":root") ?? {},
      dark: parseBlock(shared, ".dark") ?? {},
      reducedMotion: reducedMotionMedia ? (parseBlock(reducedMotionMedia[1], ":root") ?? {}) : {},
    },
    themes,
  };
}

/** Every color token each theme must define for both :root and .dark. */
export const REQUIRED_COLOR_TOKENS = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--surface-raised",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--secondary",
  "--secondary-foreground",
  "--primary",
  "--primary-hover",
  "--primary-foreground",
  "--selection",
  "--selection-foreground",
  "--selection-tint",
  "--border",
  "--border-strong",
  "--input",
  "--ring",
  "--sign-panel",
  "--sign-panel-foreground",
  "--sign-panel-muted",
  "--sign-panel-border",
  "--progress-track",
  "--progress-fill",
  "--lane-line",
  "--success",
  "--success-foreground",
  "--success-subtle",
  "--warning",
  "--warning-foreground",
  "--warning-subtle",
  "--destructive",
  "--destructive-foreground",
  "--destructive-subtle",
  "--info",
  "--info-foreground",
  "--info-subtle",
] as const;

/** Non-color tokens the SHARED block must define. */
export const REQUIRED_SHARED_TOKENS = [
  "--radius-card",
  "--radius-field",
  "--radius-button",
  "--radius-chip",
  "--radius-badge",
  "--radius-sheet",
  "--radius-sign",
  "--border-1",
  "--border-2",
  "--border-3",
  "--focus-offset",
  "--shadow-0",
  "--shadow-1",
  "--shadow-2",
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--space-7",
  "--target-min",
  "--target-primary",
  "--card-min-h",
  "--content-max",
  "--lane-dash",
  "--lane-gap",
  "--text-body",
  "--lh-body",
  "--text-body-lg",
  "--text-label",
  "--text-helper",
  "--text-button",
  "--text-eyebrow",
  "--tracking-eyebrow",
  "--text-h1",
  "--lh-h1",
  "--text-h2",
  "--text-code",
  "--tracking-code",
  "--text-number",
  "--text-small",
  "--dur-press",
  "--dur-state",
  "--dur-move",
  "--ease-standard",
] as const;
