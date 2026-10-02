// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/themes.css"), "utf8");

const REQUIRED_VARIABLES = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--destructive-foreground",
  "--success",
  "--success-foreground",
  "--warning",
  "--warning-foreground",
  "--border",
  "--input",
  "--ring",
  "--sidebar",
  "--sidebar-foreground",
];

type Block = Record<string, string>;
interface Theme {
  root: Block;
  dark: Block;
}

/** Parses `selector { --name: value; }` and returns the declarations for each match. */
function parseBlocks(source: string, selector: ":root" | ".dark"): Block[] {
  const escaped = selector.replace(".", "\\.");
  const pattern = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, "g");
  return [...source.matchAll(pattern)].map((match) => {
    const block: Block = {};
    for (const declaration of match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      block[declaration[1]] = declaration[2].trim();
    }
    return block;
  });
}

function parseThemes(source: string): Theme[] {
  const roots = parseBlocks(source, ":root");
  const darks = parseBlocks(source, ".dark");
  if (roots.length !== darks.length) {
    throw new Error(`Found ${roots.length} :root blocks but ${darks.length} .dark blocks`);
  }
  return roots.map((root, index) => ({ root, dark: darks[index] }));
}

const COMMENT = /\/\*[\s\S]*?\*\//g;
const comments = [...css.matchAll(COMMENT)].map((match) => match[0]);
const activeThemes = parseThemes(css.replace(COMMENT, ""));
const commentedThemes = comments
  .filter((comment) => comment.includes(":root"))
  .flatMap((comment) => parseThemes(comment));

describe("themes.css active theme", () => {
  it("has exactly one active theme", () => {
    expect(activeThemes).toHaveLength(1);
  });

  it.each(REQUIRED_VARIABLES)("defines %s for :root and .dark", (variable) => {
    expect(activeThemes[0].root[variable], `:root ${variable}`).toBeTruthy();
    expect(activeThemes[0].dark[variable], `.dark ${variable}`).toBeTruthy();
  });

  it("defines --radius on :root", () => {
    expect(activeThemes[0].root["--radius"]).toMatch(/^[\d.]+rem$/);
  });

  it("uses only hex color values", () => {
    for (const block of [activeThemes[0].root, activeThemes[0].dark]) {
      for (const [name, value] of Object.entries(block)) {
        if (name === "--radius") continue;
        expect(value, name).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe("themes.css commented themes", () => {
  it("has two commented themes ready to switch to", () => {
    expect(commentedThemes).toHaveLength(2);
  });

  it("each commented theme defines the same variables as the active theme", () => {
    const activeRoot = Object.keys(activeThemes[0].root).sort();
    const activeDark = Object.keys(activeThemes[0].dark).sort();
    for (const theme of commentedThemes) {
      expect(Object.keys(theme.root).sort()).toEqual(activeRoot);
      expect(Object.keys(theme.dark).sort()).toEqual(activeDark);
    }
  });

  it("no comment contains a nested comment that would break when uncommented", () => {
    for (const comment of comments) {
      expect(comment.slice(2, -2)).not.toContain("/*");
    }
  });
});

describe("globals.css", () => {
  const globals = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  it("imports themes.css", () => {
    expect(globals).toContain('@import "../styles/themes.css";');
  });

  it.each(REQUIRED_VARIABLES)("maps %s to a Tailwind color", (variable) => {
    expect(globals).toContain(`--color-${variable.slice(2)}: var(${variable});`);
  });

  it("defines no colors of its own", () => {
    expect(globals).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });
});
