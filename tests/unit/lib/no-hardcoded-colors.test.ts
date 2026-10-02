// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/components", "src/app"];
const EXTENSIONS = [".ts", ".tsx", ".css"];

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITIES =
  "bg|text|border|ring|ring-offset|fill|stroke|from|to|via|outline|shadow|divide|decoration|accent|caret|placeholder";

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: "hex color", pattern: /#[0-9a-fA-F]{3,8}\b/ },
  { name: "color function", pattern: /\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/ },
  {
    name: "Tailwind palette class",
    pattern: new RegExp(`\\b(${UTILITIES})-(${PALETTE})-\\d{2,3}\\b`),
  },
  { name: "Tailwind black/white class", pattern: new RegExp(`\\b(${UTILITIES})-(black|white)\\b`) },
];

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return EXTENSIONS.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  });
}

function findViolations(source: string): string[] {
  return source
    .split("\n")
    .flatMap((line, index) =>
      FORBIDDEN.filter(({ pattern }) => pattern.test(line)).map(
        ({ name }) => `line ${index + 1}: ${name}: ${line.trim().slice(0, 120)}`,
      ),
    );
}

describe("no hardcoded colors", () => {
  const files = ROOTS.flatMap((root) => listFiles(resolve(process.cwd(), root)));

  it("scans a real set of files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((file) => [relative(process.cwd(), file).replaceAll("\\", "/"), file]))(
    "%s uses only theme variables",
    (_name, file) => {
      expect(findViolations(readFileSync(file, "utf8"))).toEqual([]);
    },
  );

  it.each([
    ['className="bg-blue-500"', "Tailwind palette class"],
    ['className="text-zinc-50 p-2"', "Tailwind palette class"],
    ['className="bg-white"', "Tailwind black/white class"],
    ["color: #fff;", "hex color"],
    ['style={{ color: "#0f2a4a" }}', "hex color"],
    ["background: rgb(0 0 0 / 50%)", "color function"],
    ["color: oklch(0.5 0 0)", "color function"],
  ])("the detector catches %s", (line, name) => {
    expect(findViolations(line).join()).toContain(name);
  });

  it.each([
    'className="bg-primary text-muted-foreground border-border"',
    'className="bg-destructive/10 ring-ring/50"',
    '<a href="#main-content">',
    'className="text-sm size-11 gap-2"',
  ])("the detector allows %s", (line) => {
    expect(findViolations(line)).toEqual([]);
  });
});
