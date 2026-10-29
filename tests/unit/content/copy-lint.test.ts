// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The marketing copy rules (brief section 1): plain and factual, no dashes, no exclamation
 * marks, no placeholders, no fake contact details, no emoji, and none of the banned words.
 * "Employer" and "employment" are allowed: the legal line says what FleetGrid is not.
 */

const CONTENT_DIR = "src/content";

const RULES: { name: string; pattern: RegExp }[] = [
  { name: "em dash", pattern: /—/ },
  { name: "en dash", pattern: /–/ },
  { name: "exclamation mark", pattern: /!/ },
  { name: "placeholder word", pattern: /\b(lorem|TODO|TBD|placeholder)\b/i },
  { name: "square bracket (an unfilled blank)", pattern: /\[(?!\])/ },
  { name: "example.com (a fake address)", pattern: /example\.com/ },
  { name: "555 phone number", pattern: /\b555-\d/ },
  { name: "emoji", pattern: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u },
  { name: "banned word: hire", pattern: /\bhir(e|es|ed|ing)\b/i },
  { name: "banned word: employ", pattern: /\bemploy(s|ed|ing)?\b/i },
  { name: "banned word: our drivers", pattern: /\bour drivers\b/i },
  { name: "banned word: dispatch", pattern: /\bdispatch(es|ed|ing|er)?\b/i },
  { name: "banned word: guarantee", pattern: /\bguarantee[sd]?\b/i },
  { name: "banned word: vetted", pattern: /\bvet(ted|ting)?\b/i },
  { name: "banned word: background-checked", pattern: /background-checked/i },
  { name: "banned word: revolutionary", pattern: /revolutionary/i },
  { name: "banned word: seamless", pattern: /seamless/i },
  { name: "banned word: game-changer", pattern: /game-?changer/i },
  // Twilio toll-free review, rejection 30468 (2026-10-29): first-party words only.
  { name: "banned word (Twilio 30468): connects", pattern: /connect(s|ed|ing)?/i },
  { name: "banned word (Twilio 30468): match drivers with", pattern: /match(es|ing)? drivers with/i },
  { name: "banned word (Twilio 30468): leads", pattern: /leads?/i },
  { name: "banned word (Twilio 30468): access drivers", pattern: /access drivers/i },
  { name: "banned word (Twilio 30468): earn", pattern: /earn(s|ed|ing)?/i },
  { name: "banned word (Twilio 30468): opportunity", pattern: /opportunit(y|ies)/i },
  { name: "banned word (Twilio 30468): recruit", pattern: /recruit(s|ed|ing|er|ers)?/i },
  { name: "banned phrase (Twilio 30468): first to reply", pattern: /first to reply/i },
  { name: "banned word (Twilio 30468): claim, say book", pattern: /claim(s|ed|ing)?/i },
];

/** The strings a content file carries: every quoted or template literal, with code left out. */
function stringsOf(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    found.push((match[1] ?? match[2]).replace(/\$\{[^}]*\}/g, ""));
  }
  return found;
}

function contentFiles(): string[] {
  return readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => join(CONTENT_DIR, file));
}

describe("marketing copy", () => {
  const files = contentFiles();

  it("has content files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s follows the copy rules", (file) => {
    const strings = stringsOf(readFileSync(file, "utf8"));
    const violations: string[] = [];
    for (const text of strings) {
      for (const rule of RULES) {
        if (rule.pattern.test(text)) violations.push(`${rule.name}: "${text}"`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("the detector catches each rule", () => {
    const sample = [
      "Shifts — filled fast",
      "Great news!",
      "lorem ipsum",
      "[CLIENT NAME]",
      "mail@example.com",
      "(555) 555-0100",
      "We hire drivers",
      "a seamless, game-changing app",
    ];
    for (const text of sample) {
      expect(RULES.some((rule) => rule.pattern.test(text)), text).toBe(true);
    }
    for (const text of ["FleetGrid is not an employer, staffing agency or freight broker.", "employment"]) {
      expect(RULES.some((rule) => rule.pattern.test(text)), text).toBe(false);
    }
  });
});
