// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// The renderer is server-only; the guard module throws outside a server component tree.
vi.mock("server-only", () => ({}));
import { clientIp, DEFAULT_IP_HASH_SALT, hashIp } from "@/lib/qr/hash";
import { redirectPathFor, shortLinkPath, shortLinkUrl, UNTAGGED_FALLBACK } from "@/lib/qr/links";
import { QR_PNG_SIZE, renderQrPng, renderQrSvg } from "@/lib/qr/render";
import { isValidSlug, slugify } from "@/lib/qr/slug";
import {
  analyticsQuerySchema,
  createQrLinkSchema,
  DEFAULT_CAMPAIGN,
  LANDING_PATHS,
  slugFor,
} from "@/lib/validation/qr.schema";

describe("slugify", () => {
  it.each([
    ["Love's, Hwy 225", "loves-hwy-225"],
    ["Buc-ee's & Pilot", "buc-ees-and-pilot"],
    ["  Flying J   Baytown  ", "flying-j-baytown"],
    ["Café Olé", "cafe-ole"],
    ["!!!", ""],
    ["", ""],
  ])("%j becomes %j", (text, slug) => {
    expect(slugify(text)).toBe(slug);
  });

  it("keeps to 60 characters and never ends in a dash", () => {
    const slug = slugify("a".repeat(30) + " " + "b".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
    expect(isValidSlug(slug)).toBe(true);
  });

  it("validates slugs", () => {
    for (const good of ["ab", "loves-hwy-225", "a1-b2"]) expect(isValidSlug(good)).toBe(true);
    for (const bad of ["a", "Loves", "loves--225", "-loves", "loves-", "love s", "a".repeat(61)]) {
      expect(isValidSlug(bad), bad).toBe(false);
    }
  });
});

describe("links", () => {
  const link = { slug: "loves-hwy-225", targetPath: "/", utmSource: "flyer", utmMedium: "qr", campaign: "pasadena-225" };

  it("builds the short link and the tagged landing path", () => {
    expect(shortLinkPath("loves-hwy-225")).toBe("/q/loves-hwy-225");
    expect(shortLinkUrl("https://fleetgridus.com", "loves-hwy-225")).toBe("https://fleetgridus.com/q/loves-hwy-225");
    expect(redirectPathFor(link)).toBe(
      "/?utm_source=flyer&utm_medium=qr&utm_campaign=pasadena-225&utm_content=loves-hwy-225",
    );
    expect(redirectPathFor({ ...link, targetPath: "/drivers" })).toBe(
      "/drivers?utm_source=flyer&utm_medium=qr&utm_campaign=pasadena-225&utm_content=loves-hwy-225",
    );
    expect(UNTAGGED_FALLBACK).toBe("/");
  });
});

describe("hashIp", () => {
  it("is a salted one-way hash, never the address, and null without one", () => {
    const hash = hashIp("203.0.113.9", "salt-a");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203");
    expect(hashIp("203.0.113.9", "salt-a")).toBe(hash);
    expect(hashIp("203.0.113.9", "salt-b")).not.toBe(hash);
    expect(hashIp("203.0.113.9")).toBe(hashIp("203.0.113.9", DEFAULT_IP_HASH_SALT));
    expect(hashIp(null)).toBeNull();
    expect(hashIp("   ")).toBeNull();
  });

  it("reads the client address from the proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("render", () => {
  const artwork = { url: "https://fleetgridus.com/q/loves-hwy-225", label: "Love's, Hwy 225", caption: "fleetgridus.com/q/loves-hwy-225" };

  it("makes an SVG document with the code, the label and the caption, escaped, that parses", async () => {
    const svg = await renderQrSvg(artwork);
    expect(svg.startsWith("<?xml")).toBe(true);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1200"');
    expect(svg).toContain("<path");
    expect(svg).toContain("Love&apos;s, Hwy 225");
    expect(svg).toContain("fleetgridus.com/q/loves-hwy-225");
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    // Whether it parses as XML is checked in qr-svg.test.ts, which has a DOM parser.
  });

  it("makes a print-size PNG", async () => {
    const response = await renderQrPng(artwork);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR: width and height, big-endian, right after the signature and the chunk header.
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(16)).toBe(QR_PNG_SIZE.width);
    expect(view.getUint32(20)).toBe(QR_PNG_SIZE.height);
  }, 30_000);
});

describe("createQrLinkSchema", () => {
  it("fills the defaults and makes the slug from the location name", () => {
    const data = createQrLinkSchema.parse({ locationName: " Love's, Hwy 225 ", campaign: "", targetPath: "", slug: "" });
    expect(data).toEqual({ locationName: "Love's, Hwy 225", campaign: DEFAULT_CAMPAIGN, targetPath: "/", slug: "" });
    expect(slugFor(data)).toBe("loves-hwy-225");
    expect(slugFor({ ...data, slug: "custom-1" })).toBe("custom-1");
  });

  it("refuses a short name, a bad campaign, an unknown page and a bad slug", () => {
    expect(createQrLinkSchema.safeParse({ locationName: "L", campaign: "", targetPath: "", slug: "" }).success).toBe(false);
    expect(createQrLinkSchema.safeParse({ locationName: "Love's", campaign: "Pasadena 225", targetPath: "", slug: "" }).success).toBe(false);
    expect(createQrLinkSchema.safeParse({ locationName: "Love's", campaign: "", targetPath: "/admin", slug: "" }).success).toBe(false);
    expect(createQrLinkSchema.safeParse({ locationName: "Love's", campaign: "", targetPath: "", slug: "Bad Slug" }).success).toBe(false);
    expect(LANDING_PATHS.map((option) => option.value)).toEqual(["/", "/carriers", "/drivers", "/faq", "/contact"]);
  });

  it("reads the analytics query with quiet fallbacks", () => {
    expect(analyticsQuerySchema.parse({})).toEqual({ period: "30", open: undefined });
    expect(analyticsQuerySchema.parse({ period: "7", open: "aaaaaaaa-0000-4000-8000-000000000001" })).toEqual({
      period: "7",
      open: "aaaaaaaa-0000-4000-8000-000000000001",
    });
    expect(analyticsQuerySchema.parse({ period: "90", open: "nope" })).toEqual({ period: "30", open: undefined });
  });
});
