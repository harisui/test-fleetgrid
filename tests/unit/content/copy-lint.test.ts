// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
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
  { name: "banned word (Twilio 30468): connects", pattern: /\bconnect(s|ed|ing)?\b/i },
  { name: "banned word (Twilio 30468): match drivers with", pattern: /\bmatch(es|ing)? drivers with\b/i },
  { name: "banned word (Twilio 30468): leads", pattern: /\bleads?\b/i },
  { name: "banned word (Twilio 30468): access drivers", pattern: /\baccess drivers\b/i },
  { name: "banned word (Twilio 30468): earn", pattern: /\bearn(s|ed|ing)?\b/i },
  { name: "banned word (Twilio 30468): opportunity", pattern: /\bopportunit(y|ies)\b/i },
  { name: "banned word (Twilio 30468): recruit", pattern: /\brecruit(s|ed|ing|er|ers)?\b/i },
  { name: "banned phrase (Twilio 30468): first to reply", pattern: /first to reply/i },
  { name: "banned word (Twilio 30468): claim, say book", pattern: /\bclaim(s|ed|ing)?\b/i },
  // CR-5 (2026-11-03): "Verified" implies a background check FleetGrid does not run. Say
  // Registered or Roster-Ready.
  { name: "banned word (CR-5): verified", pattern: /\bverified\b/i },
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
      "Verified drivers",
      "every driver is verified",
      "Claim this shift",
      "Text leads",
    ];
    for (const text of sample) {
      expect(RULES.some((rule) => rule.pattern.test(text)), text).toBe(true);
    }
    for (const text of ["FleetGrid is not an employer, staffing agency or freight broker.", "employment"]) {
      expect(RULES.some((rule) => rule.pattern.test(text)), text).toBe(false);
    }
  });
});

/** Every .ts and .tsx file under a folder. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * What a person can read in a source file: string and template literals and JSX text, from
 * the syntax tree. Comments, imports and code are not read, and neither is a lone lowercase
 * word such as "approved" or "driver-approved": those are internal names and database values.
 */
function readableCopy(source: string, fileName = "copy.tsx"): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.push(node.text);
    else if (ts.isTemplateExpression(node)) {
      found.push(node.head.text, ...node.templateSpans.map((span) => span.literal.text));
    } else if (ts.isJsxText(node) && node.text.trim()) found.push(node.text.replace(/\s+/g, " ").trim());
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found.filter((text) => !/^[a-z][a-z0-9_-]*$/.test(text));
}

/** Annie's list (2026-11-04). */
const REVIEW_WORDS = /\b(verified|vetted|approved?|approves|approving|approval|screened|candidates?)\b/i;

const COPY_DIRS = ["src/app", "src/components", "src/content", "src/lib", "src/server"];
const LABELS_FILE = join("src", "lib", "drivers", "tiers.ts");

describe("the review words (Annie, 2026-11-04)", () => {
  it.each(COPY_DIRS)("nothing a person reads in %s says verified, vetted, approved, screened or candidate", (dir) => {
    const hits = sourceFiles(dir).flatMap((file) =>
      readableCopy(readFileSync(file, "utf8"))
        .filter((text) => REVIEW_WORDS.test(text))
        .map((text) => `${file}: "${text}"`),
    );
    expect(hits).toEqual([]);
  });

  it.each(COPY_DIRS)("%s never says the retired Shift-Ready", (dir) => {
    const hits = sourceFiles(dir).flatMap((file) =>
      readableCopy(readFileSync(file, "utf8"))
        .filter((text) => /shift[- ]ready/i.test(text))
        .map((text) => `${file}: "${text}"`),
    );
    expect(hits).toEqual([]);
  });

  it.each(COPY_DIRS)("%s takes Roster-Ready and Documented profile from the one constant", (dir) => {
    const hits = sourceFiles(dir)
      .filter((file) => file !== LABELS_FILE)
      .flatMap((file) =>
        readableCopy(readFileSync(file, "utf8"))
          .filter((text) => /Roster-Ready|Documented profile/.test(text))
          .map((text) => `${file}: "${text}"`),
      );
    expect(hits).toEqual([]);
  });

  it("the detector reads JSX text and strings, and leaves comments and internal names alone", () => {
    const flagged = (source: string) => readableCopy(source).filter((text) => REVIEW_WORDS.test(text));
    expect(flagged(`const a = <p>Every driver here is approved</p>;`)).toHaveLength(1);
    expect(flagged(`const a = "Approved drivers";`)).toHaveLength(1);
    expect(flagged("const a = `Once approved, ${name}`;")).toHaveLength(1);
    expect(flagged(`const a = <Button>Approve</Button>;`)).toHaveLength(1);
    expect(flagged(`const a = "Approve";`)).toHaveLength(1);
    for (const words of ["vetted drivers", "a screened driver", "Candidates", "Verified", "Approval text"]) {
      expect(flagged(`const a = ${JSON.stringify(words)};`), words).toHaveLength(1);
    }
    expect(flagged(`// approved by Annie\nconst a = 1;`)).toEqual([]);
    expect(flagged(`const a = status === "approved" ? "driver_approved" : "approve-reason";`)).toEqual([]);
    expect(flagged(`import { x } from "@/approved/thing";`)).toEqual([]);
  });
});
