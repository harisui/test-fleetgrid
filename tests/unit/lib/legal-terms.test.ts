// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CURRENT_TERMS, TERMS_VERSIONS } from "@/content/legal/terms";
import { TOS_VERSION } from "@/lib/constants";
import { DRIVER_TERMS_STATEMENT, TERMS_LINK_PREFIX } from "@/lib/legal/terms-acceptance";
import { legalHeadings, parseInline, parseLegalMarkdown } from "@/lib/legal/markdown";
import { termsLinkText } from "@/lib/shifts/texts";
import { smsSegments } from "@/lib/sms/segments";

describe("the legal markdown (Milestone 6)", () => {
  it("reads headings, paragraphs, lists with one level inside, links and line breaks", () => {
    const blocks = parseLegalMarkdown(
      "Intro [Terms](/terms).\n\n## 1. One\n\n- first\n  continued\n- second:\n  - inner a\n  - inner b\n- third\n\nLine one\\\nLine two",
    );
    expect(blocks).toEqual([
      { kind: "paragraph", content: [{ kind: "text", text: "Intro " }, { kind: "link", text: "Terms", href: "/terms" }, { kind: "text", text: "." }] },
      { kind: "heading", text: "1. One" },
      {
        kind: "list",
        items: [
          { content: [{ kind: "text", text: "first" }, { kind: "text", text: " " }, { kind: "text", text: "continued" }], children: [] },
          {
            content: [{ kind: "text", text: "second:" }],
            children: [
              { content: [{ kind: "text", text: "inner a" }], children: [] },
              { content: [{ kind: "text", text: "inner b" }], children: [] },
            ],
          },
          { content: [{ kind: "text", text: "third" }], children: [] },
        ],
      },
      { kind: "paragraph", content: [{ kind: "text", text: "Line one" }, { kind: "break" }, { kind: "text", text: "Line two" }] },
    ]);
  });

  it("keeps everything else as plain text, exactly as written", () => {
    expect(parseInline("A *star*, an [unclosed link and (brackets)")).toEqual([
      { kind: "text", text: "A *star*, an [unclosed link and (brackets)" },
    ]);
  });

  it("refuses a malformed list line rather than guess", () => {
    expect(() => parseLegalMarkdown("- item\nstray")).toThrow(/list line/);
  });
});

describe("the published Terms", () => {
  it("TOS_VERSION is the current version (kept as a string so the text stays out of browser bundles)", () => {
    expect(TOS_VERSION).toBe(CURRENT_TERMS.version);
    expect(CURRENT_TERMS).toBe(TERMS_VERSIONS[TERMS_VERSIONS.length - 1]);
  });

  it("every version has a unique id in the archive's format, a real date and text that parses", () => {
    expect(new Set(TERMS_VERSIONS.map((entry) => entry.version)).size).toBe(TERMS_VERSIONS.length);
    for (const entry of TERMS_VERSIONS) {
      expect(entry.version).toMatch(/^\d{4}-\d{2}-v\d+$/);
      expect(new Date(`${entry.effectiveDate}T12:00:00Z`).toISOString().slice(0, 10)).toBe(entry.effectiveDate);
      expect(entry.effectiveLabel).toBe(
        new Date(`${entry.effectiveDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }),
      );
      expect(() => parseLegalMarkdown(entry.body)).not.toThrow();
    }
  });

  it("the current text keeps its fourteen sections and the fixed contact details", () => {
    expect(legalHeadings(CURRENT_TERMS.body)).toHaveLength(14);
    expect(CURRENT_TERMS.body).toContain("support@fleetgridus.com");
    expect(CURRENT_TERMS.body).toContain("8401 Mayland Dr. STE A");
  });

  it("2026-10-v2 is the text that was live, and needs no one to accept it again", () => {
    const v2 = TERMS_VERSIONS.find((entry) => entry.version === "2026-10-v2")!;
    expect(v2.requiresReacceptance).toBe(false);
    expect(v2.effectiveDate).toBe("2026-10-29");
  });
});

describe("the driver's acceptance", () => {
  it("states the Terms and the Privacy Policy", () => {
    expect(DRIVER_TERMS_STATEMENT).toBe("I have read and agree to the FleetGrid Terms of Service and Privacy Policy.");
  });

  it("the link text is one plain GSM-7 segment with the full link, ending with the opt-out", () => {
    const text = termsLinkText(`fleetgridus.com${TERMS_LINK_PREFIX}/${"A".repeat(22)}`);
    expect(smsSegments(text).segments).toBe(1);
    expect(text).toMatch(/^FleetGrid: /);
    expect(text).toMatch(/Reply STOP to opt out\.$/);
    expect(text).not.toMatch(/[’‘“”]/);
  });
});
