// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every visual value comes from src/styles/themes.css. This scans the source for anything
 * that bypasses the tokens: raw colors, Tailwind palette classes, arbitrary sizes, large
 * radii, big shadows, bouncy motion, confetti, emoji and exclamation marks in UI copy.
 * It also enforces the Workshop rule that the orange primary fill appears in exactly two
 * places: the primary button and the check badge.
 */

const ROOT = "src";
const EXTENSIONS = [".ts", ".tsx", ".css"];
const SKIPPED = ["src/styles/themes.css", "src/types/database.types.ts"];

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_UTILITIES =
  "bg|text|border|ring|ring-offset|fill|stroke|from|to|via|outline|shadow|divide|decoration|accent|caret|placeholder";
const SIZE_UTILITIES =
  "h|w|min-h|min-w|max-h|max-w|size|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|inset|top|right|bottom|left|text|leading|tracking|rounded|shadow";

/** Files allowed to paint with the orange primary fill. */
const PRIMARY_FILL_ALLOWED = [
  "src/components/ui/button.tsx",
  "src/components/shared/CheckBadge.tsx",
];

interface Rule {
  name: string;
  pattern: RegExp;
  /** Only these extensions are checked. Defaults to all. */
  extensions?: string[];
  /** Files exempt from this rule. */
  allow?: string[];
}

const RULES: Rule[] = [
  { name: "hex color", pattern: /#[0-9a-fA-F]{3,8}\b/ },
  {
    name: "color function",
    pattern: /\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/,
    allow: ["src/app/globals.css"],
  },
  {
    name: "Tailwind palette class",
    pattern: new RegExp(`\\b(${COLOR_UTILITIES})-(${PALETTE})-\\d{2,3}\\b`),
  },
  {
    name: "Tailwind black/white class",
    pattern: new RegExp(`\\b(${COLOR_UTILITIES})-(black|white)\\b`),
  },
  { name: "arbitrary color", pattern: /-\[#|-\[(rgb|hsl|oklch)/ },
  {
    name: "large radius",
    pattern: /\brounded-(t-|r-|b-|l-|tl-|tr-|br-|bl-)?(xl|2xl|3xl|4xl|full)\b/,
  },
  { name: "arbitrary radius", pattern: /\brounded(-[a-z]+)?-\[/ },
  { name: "soft shadow", pattern: /\bshadow-(xs|sm|md|lg|xl|2xl)\b|\bshadow-\[/ },
  {
    name: "bouncy motion",
    pattern: /\banimate-(bounce|ping|wiggle)\b|\b(hover|active|focus):scale-/,
  },
  {
    name: "arbitrary pixel or rem size",
    pattern: new RegExp(`\\b(${SIZE_UTILITIES})-\\[[^\\]]*\\d(px|rem|em)\\]`),
  },
  { name: "confetti", pattern: /confetti/i },
  { name: "emoji in UI", pattern: /\p{Extended_Pictographic}/u, extensions: [".tsx"] },
  {
    name: "exclamation mark in UI copy",
    pattern: /[A-Za-z]!["'`<]|>[^<>{}]*[A-Za-z]![^<>{}]*</,
    extensions: [".tsx"],
  },
  {
    name: "orange primary fill outside the button and check badge",
    pattern: /\b(bg|from|to|via|fill)-primary(?!-foreground)(\/\d+)?\b|\bbg-primary-hover\b/,
    allow: PRIMARY_FILL_ALLOWED,
  },
  {
    name: "orange primary used for text, borders or rings",
    pattern:
      /\b(text|border|ring|outline|stroke|decoration|caret|accent|divide)-primary(?!-foreground)\b/,
  },
  {
    name: "primary token used in CSS",
    pattern: /var\(--primary(-hover)?\)/,
    allow: ["src/app/globals.css"],
  },
];

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return EXTENSIONS.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  });
}

export function findViolations(source: string, file = "x.tsx"): string[] {
  const extension = file.slice(file.lastIndexOf("."));
  return source
    .split("\n")
    .flatMap((line, index) =>
      RULES.filter(
        ({ pattern, extensions, allow }) =>
          (!extensions || extensions.includes(extension)) &&
          !(allow ?? []).includes(file) &&
          pattern.test(line),
      ).map(({ name }) => `line ${index + 1}: ${name}: ${line.trim().slice(0, 120)}`),
    );
}

describe("no hardcoded styling", () => {
  const files = listFiles(resolve(process.cwd(), ROOT))
    .map((file) => relative(process.cwd(), file).replaceAll("\\", "/"))
    .filter((file) => !SKIPPED.includes(file));

  it("scans a real set of files", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files).toContain("src/components/ui/button.tsx");
  });

  it.each(files)("%s uses only theme tokens", (file) => {
    expect(findViolations(readFileSync(resolve(process.cwd(), file), "utf8"), file)).toEqual([]);
  });

  it.each([
    ['className="bg-blue-500"', "Tailwind palette class"],
    ['className="bg-white"', "Tailwind black/white class"],
    ["color: #fff;", "hex color"],
    ["background: rgb(0 0 0 / 50%)", "color function"],
    ['className="bg-[#123456]"', "arbitrary color"],
    ['className="rounded-xl"', "large radius"],
    ['className="rounded-full"', "large radius"],
    ['className="rounded-t-2xl"', "large radius"],
    ['className="rounded-[14px]"', "arbitrary radius"],
    ['className="shadow-md"', "soft shadow"],
    ['className="shadow-[0_4px_12px]"', "soft shadow"],
    ['className="animate-bounce"', "bouncy motion"],
    ['className="active:scale-95"', "bouncy motion"],
    ['className="h-[60px]"', "arbitrary pixel or rem size"],
    ['className="tracking-[0.4em]"', "arbitrary pixel or rem size"],
    ['import confetti from "canvas-confetti"', "confetti"],
    ["<p>Great job 🎉</p>", "emoji in UI"],
    ["<p>Saved!</p>", "exclamation mark in UI copy"],
    ['const message = "Welcome aboard!";', "exclamation mark in UI copy"],
    ['className="bg-primary"', "orange primary fill"],
    ['className="bg-primary/10"', "orange primary fill"],
    ['className="text-primary"', "orange primary used for text"],
    ['className="border-primary"', "orange primary used for text"],
    ["color: var(--primary);", "primary token used in CSS"],
  ])("the detector catches %s", (line, name) => {
    expect(findViolations(line).join()).toContain(name);
  });

  it.each([
    'className="bg-primary text-primary-foreground"',
    'className="text-muted-foreground border-border rounded-card shadow-1"',
    'className="h-target-lg min-h-card-min size-target"',
    'className="w-[calc(100%-2rem)] max-h-[70dvh]"',
    'className="duration-(--dur-press) ease-standard animate-spin"',
    "if (!open && value !== null) return;",
    "const ready = !!user;",
    'className="bg-primary-hover"',
  ])("the detector allows %s in an allowed file", (line) => {
    expect(findViolations(line, "src/components/ui/button.tsx")).toEqual([]);
  });

  it("the orange fill is caught outside the two allowed files", () => {
    expect(findViolations('className="bg-primary"', "src/components/ui/button.tsx")).toEqual([]);
    expect(
      findViolations('className="bg-primary"', "src/components/shared/CheckBadge.tsx"),
    ).toEqual([]);
    expect(
      findViolations('className="bg-primary"', "src/components/shared/Chip.tsx").join(),
    ).toContain("orange primary fill");
  });
});
