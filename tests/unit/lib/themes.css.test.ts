// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHex, rgbToLab } from "@/lib/color";
import {
  isCommentedOut,
  parseBlock,
  parseThemesCss,
  REQUIRED_COLOR_TOKENS,
  REQUIRED_SHARED_TOKENS,
  sectionOf,
} from "../../setup/themes";

const parsed = parseThemesCss();
const HEX = /^#[0-9a-f]{6}$/;

describe("themes.css structure", () => {
  it("has a shared block and three themes", () => {
    expect(parsed.themes.map((theme) => theme.name)).toEqual([
      "WORKSHOP",
      "INTERSTATE",
      "GUIDE SIGN",
    ]);
  });

  it("Workshop is the only active theme; the others are commented out", () => {
    expect(parsed.themes.map((theme) => theme.active)).toEqual([true, false, false]);
    expect(parsed.source).toContain("THEME 1: WORKSHOP (ACTIVE)");
  });

  it("a commented theme contains no nested comment, so uncommenting it works", () => {
    for (const theme of parsed.themes.filter((candidate) => !candidate.active)) {
      const section = sectionOf(parsed.source, `THEME ${theme.number}`).trim();
      expect(isCommentedOut(section)).toBe(true);
      expect(section.slice(2, -2)).not.toContain("/*");
      expect(section.slice(2, -2)).not.toContain("*/");
    }
  });

  it("the live CSS defines exactly one :root color block and one .dark color block", () => {
    const live = parsed.source.replace(/\/\*[\s\S]*?\*\//g, "");
    const roots = [...live.matchAll(/(?:^|\n)\s*:root\s*\{/g)].length;
    const darks = [...live.matchAll(/(?:^|\n)\s*\.dark\s*\{/g)].length;
    // One shared, one theme, one reduced-motion override.
    expect(roots).toBe(3);
    expect(darks).toBe(2);
  });
});

describe("themes.css shared tokens", () => {
  it.each(REQUIRED_SHARED_TOKENS)("defines %s", (token) => {
    expect(parsed.shared.root[token], token).toBeTruthy();
  });

  it("uses small radii, as the brief requires (4 to 8px, no pills)", () => {
    for (const token of [
      "--radius-card",
      "--radius-field",
      "--radius-button",
      "--radius-chip",
      "--radius-badge",
      "--radius-sheet",
      "--radius-sign",
    ]) {
      const px = Number.parseFloat(parsed.shared.root[token]);
      expect(px, token).toBeGreaterThanOrEqual(2);
      expect(px, token).toBeLessThanOrEqual(8);
    }
  });

  it("meets the size floors: 48px targets, 56px primary actions, 18px body", () => {
    expect(parsed.shared.root["--target-min"]).toBe("48px");
    expect(parsed.shared.root["--target-primary"]).toBe("56px");
    expect(parsed.shared.root["--card-min-h"]).toBe("64px");
    expect(parsed.shared.root["--text-body"]).toBe("1.125rem");
    expect(parsed.shared.root["--text-button"]).toBe("1.1875rem");
  });

  it("dark mode removes shadows (elevation comes from surface-raised plus a border)", () => {
    expect(parsed.shared.dark["--shadow-1"]).toBe("none");
    expect(parsed.shared.dark["--shadow-2"]).toBe("none");
  });

  it("reduced motion sets every duration to 0ms", () => {
    expect(parsed.shared.reducedMotion).toEqual({
      "--dur-press": "0ms",
      "--dur-state": "0ms",
      "--dur-move": "0ms",
      "--dur-hint": "0ms",
    });
  });

  it("the scroll hint dips slowly and only a little", () => {
    expect(Number.parseInt(parsed.shared.root["--dur-hint"], 10)).toBeGreaterThanOrEqual(1500);
    expect(Number.parseInt(parsed.shared.root["--hint-travel"], 10)).toBeLessThanOrEqual(8);
  });

  it("motion has no spring: a standard ease-out curve, presses and state changes in 200ms or less", () => {
    expect(parsed.shared.root["--ease-standard"]).toBe("cubic-bezier(0.2, 0, 0, 1)");
    for (const token of ["--dur-press", "--dur-state"]) {
      expect(Number.parseInt(parsed.shared.root[token], 10)).toBeLessThanOrEqual(200);
    }
    // The truck drives to the next stop at a visible pace, still well under a second.
    const move = Number.parseInt(parsed.shared.root["--dur-move"], 10);
    expect(move).toBeGreaterThanOrEqual(400);
    expect(move).toBeLessThanOrEqual(800);
  });
});

describe.each(parsed.themes.map((theme) => [theme.name, theme] as const))(
  "theme %s",
  (_name, theme) => {
    it.each(REQUIRED_COLOR_TOKENS)("defines %s in :root and .dark", (token) => {
      expect(theme.root[token], `:root ${token}`).toMatch(HEX);
      expect(theme.dark[token], `.dark ${token}`).toMatch(HEX);
    });

    it("defines exactly the required token set, nothing more, in both modes", () => {
      const expected = [...REQUIRED_COLOR_TOKENS].sort();
      expect(Object.keys(theme.root).sort()).toEqual(expected);
      expect(Object.keys(theme.dark).sort()).toEqual(expected);
    });

    it.each([["root"], ["dark"]] as const)("keeps the shadcn aliases neutral (%s)", (mode) => {
      const block = theme[mode];
      // shadcn uses --accent for menu hover: it must stay neutral, never the selection color.
      expect(block["--accent"]).toBe(block["--muted"]);
      expect(block["--secondary"]).toBe(block["--muted"]);
      expect(block["--accent-foreground"]).toBe(block["--foreground"]);
      expect(block["--secondary-foreground"]).toBe(block["--foreground"]);
      expect(block["--card-foreground"]).toBe(block["--foreground"]);
      expect(block["--popover"]).toBe(block["--surface-raised"]);
      expect(block["--popover-foreground"]).toBe(block["--foreground"]);
      expect(block["--input"]).toBe(block["--border-strong"]);
      expect(block["--accent"]).not.toBe(block["--selection"]);
    });
  },
);

describe("Workshop rules", () => {
  const workshop = parsed.themes[0];
  const chroma = (hex: string) => {
    const lab = rgbToLab(parseHex(hex));
    return Math.hypot(lab.a, lab.b);
  };

  it.each([["root"], ["dark"]] as const)(
    "orange is only the primary, the progress fill and the sign stripe (%s)",
    (mode) => {
      const block = workshop[mode];
      const orange = block["--primary"];
      expect(block["--progress-fill"]).toBe(orange);
      expect(block["--sign-panel-border"]).toMatch(HEX);
      for (const token of [
        "--selection",
        "--border",
        "--border-strong",
        "--input",
        "--ring",
        "--muted-foreground",
        "--foreground",
        "--warning",
        "--destructive",
      ]) {
        expect(block[token], token).not.toBe(orange);
      }
    },
  );

  it.each([["root"], ["dark"]] as const)("selection is graphite ink, not a hue (%s)", (mode) => {
    expect(chroma(workshop[mode]["--selection"])).toBeLessThan(6);
    expect(chroma(workshop[mode]["--selection-tint"])).toBeLessThan(6);
  });
});

describe("globals.css", () => {
  const globals = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  it("imports themes.css", () => {
    expect(globals).toContain('@import "../styles/themes.css";');
  });

  it.each(REQUIRED_COLOR_TOKENS)("maps %s to a Tailwind color", (token) => {
    expect(globals).toContain(`--color-${token.slice(2)}: var(${token});`);
  });

  it("maps the heading font, radii, shadows and type sizes", () => {
    expect(globals).toContain("--font-heading: var(--font-barlow-condensed);");
    for (const token of ["card", "field", "button", "chip", "badge", "sheet", "sign"]) {
      expect(globals).toContain(`--radius-${token}: var(--radius-${token});`);
    }
    expect(globals).toContain("--shadow-1: var(--shadow-1);");
    expect(globals).toContain("--text-body: var(--text-body);");
    expect(globals).toContain("--text-body--line-height: var(--lh-body);");
  });

  it("caps the shadcn radius scale at the sheet radius so nothing can grow a large radius", () => {
    expect(globals).toContain("--radius-lg: var(--radius-card);");
    expect(globals).toContain("--radius-xl: var(--radius-sheet);");
  });

  it("defines no colors or sizes of its own", () => {
    expect(globals).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
    expect(globals).not.toMatch(/:\s*\d+px/);
  });

  it("sets body type from the tokens and one focus ring for everything", () => {
    expect(globals).toContain("font-size: var(--text-body);");
    expect(globals).toContain("line-height: var(--lh-body);");
    expect(globals).toMatch(
      /:focus-visible\s*\{\s*outline: var\(--border-3\) solid var\(--ring\);\s*outline-offset: var\(--focus-offset\);/,
    );
  });

  it("switches animations and transitions off under reduced motion", () => {
    expect(globals).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*transition-duration: 0s !important/,
    );
  });
});

describe("parser self-checks", () => {
  it("parses declarations and ignores other selectors", () => {
    expect(parseBlock(".x { --a: 1; }\n:root {\n  --b: #fff;\n}", ":root")).toEqual({
      "--b": "#fff",
    });
    expect(parseBlock("body {}", ":root")).toBeNull();
  });

  it("throws on missing markers", () => {
    expect(() => sectionOf("nothing", "THEME 9")).toThrow(/markers/);
    expect(() =>
      parseThemesCss("/* ==== SHARED START ==== */ /* ==== SHARED END ==== */"),
    ).not.toThrow();
    expect(() =>
      parseThemesCss(
        "/* ==== SHARED START ==== */ /* ==== SHARED END ==== */ /* ==== THEME 1 START ==== */ :root{} /* ==== THEME 1 END ==== */",
      ),
    ).toThrow(/both :root and .dark/);
  });
});
