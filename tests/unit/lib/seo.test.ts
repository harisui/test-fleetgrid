// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import robots, { DISALLOWED_PATHS } from "@/app/robots";
import sitemap, { LEGAL_EFFECTIVE_DATE_ISO } from "@/app/sitemap";
import { FAQ_GROUPS } from "@/content/faq";
import { SEO_PAGES, seoPage, type SeoPath } from "@/content/seo";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/constants";
import { resetEnvCache } from "@/lib/env";
import { OG_SIZE, ogAlt, renderOgImage } from "@/lib/og/image";
import { OG_TOKEN_NAMES, ogTokens, parseActiveThemeTokens } from "@/lib/og/tokens";
import {
  breadcrumbJsonLd,
  carrierServiceJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  pageMetadata,
  SERVICE_AREA_RADIUS_METERS,
  serializeJsonLd,
  websiteJsonLd,
} from "@/lib/seo";

vi.mock("server-only", () => ({}));

const PATHS = SEO_PAGES.map((page) => page.path);

beforeEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("the page table", () => {
  it("covers every public page once, with a unique title and description of a sensible length", () => {
    expect(PATHS).toEqual(["/", "/carriers", "/drivers", "/faq", "/contact", "/terms", "/privacy", "/sms-terms"]);
    expect(new Set(SEO_PAGES.map((page) => page.title)).size).toBe(SEO_PAGES.length);
    expect(new Set(SEO_PAGES.map((page) => page.description)).size).toBe(SEO_PAGES.length);
    for (const page of SEO_PAGES) {
      expect(page.description.length, page.path).toBeGreaterThanOrEqual(70);
      expect(page.description.length, page.path).toBeLessThanOrEqual(160);
      expect(page.title.length, page.path).toBeLessThanOrEqual(60);
    }
    expect(() => seoPage("/nowhere" as SeoPath)).toThrow("No SEO entry for /nowhere");
  });

  it("names only the launch scope: Class A and B drivers, no yard spotters or mechanics", () => {
    const text = JSON.stringify(SEO_PAGES);
    expect(text).not.toMatch(/spotter|mechanic|Class C/i);
    expect(seoPage("/").description).toContain("Class A and B");
  });
});

describe("pageMetadata", () => {
  it("gives the home page an absolute title and every page its canonical and both cards", () => {
    const home = pageMetadata("/");
    expect(home.title).toEqual({ absolute: "FleetGrid: Local CDL Drivers for Open Shifts in Houston" });
    expect(home.openGraph).toMatchObject({ title: "FleetGrid: Local CDL Drivers for Open Shifts in Houston", url: "/" });

    for (const path of PATHS.filter((path) => path !== "/")) {
      const meta = pageMetadata(path);
      expect(meta.title).toBe(seoPage(path).title);
      expect(meta.description).toBe(seoPage(path).description);
      expect(meta.alternates).toEqual({ canonical: path });
      expect(meta.openGraph).toMatchObject({
        type: "website",
        siteName: "FleetGrid",
        url: path,
        title: `${seoPage(path).title} | FleetGrid`,
      });
      expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: `${seoPage(path).title} | FleetGrid` });
    }
  });
});

describe("structured data", () => {
  it("describes FleetGrid LLC and the site, on the configured site URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.fleetgridus.com");
    resetEnvCache();
    expect(organizationJsonLd()).toMatchObject({
      "@type": "Organization",
      name: "FleetGrid",
      legalName: "FleetGrid LLC",
      url: "https://preview.fleetgridus.com/",
      email: "support@fleetgridus.com",
      areaServed: "Houston, TX",
    });
    expect(websiteJsonLd()).toMatchObject({
      "@type": "WebSite",
      url: "https://preview.fleetgridus.com/",
      publisher: { "@id": "https://preview.fleetgridus.com/#organization" },
    });
  });

  it("prices the carrier service at $399 a month over a 50-mile circle around Pasadena", () => {
    const service = carrierServiceJsonLd();
    expect(service).toMatchObject({
      "@type": "Service",
      serviceType: "Transport operator directory and shift messaging",
      areaServed: { "@type": "GeoCircle", geoRadius: 80467 },
      offers: { "@type": "Offer", price: 399, priceCurrency: "USD", priceSpecification: { unitText: "monthly" } },
    });
    expect(SERVICE_AREA_RADIUS_METERS).toBe(Math.round(50 * 1609.344));
  });

  it("builds a two-step breadcrumb for inner pages and a one-step one for home", () => {
    expect(breadcrumbJsonLd("/faq").itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://fleetgridus.com/" },
      { "@type": "ListItem", position: 2, name: "FAQ", item: "https://fleetgridus.com/faq" },
    ]);
    expect(breadcrumbJsonLd("/").itemListElement).toHaveLength(1);
  });

  it("puts every visible FAQ question and answer in the FAQPage, word for word", () => {
    const faq = faqPageJsonLd(FAQ_GROUPS) as unknown as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    const visible = FAQ_GROUPS.flatMap((group) => group.entries);
    expect(faq.mainEntity).toHaveLength(visible.length);
    expect(faq.mainEntity.map((question) => [question.name, question.acceptedAnswer.text])).toEqual(
      visible.map((entry) => [entry.question, entry.answer]),
    );
  });

  it("escapes < so no string can close the script tag", () => {
    const json = serializeJsonLd({ "@type": "Thing", name: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("sitemap and robots", () => {
  it("lists the eight public pages on the site URL and nothing private", () => {
    const entries = sitemap();
    expect(entries.map((entry) => entry.url)).toEqual(PATHS.map((path) => `https://fleetgridus.com${path}`));
    for (const entry of entries) {
      expect(entry.url).not.toMatch(/login|verify|choose-role|driver\/|carrier\/|admin|api/);
      expect(entry.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(entries.find((entry) => entry.url.endsWith("/terms"))?.lastModified).toBe(LEGAL_EFFECTIVE_DATE_ISO);
    // The ISO date is the same day the legal pages show.
    expect(new Date(`${LEGAL_EFFECTIVE_DATE_ISO}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })).toBe(
      LEGAL_EFFECTIVE_DATE,
    );
  });

  it("allows the public site, keeps crawlers out of the signed-in areas and the API, and points at the sitemap", () => {
    const file = robots();
    expect(file.rules).toEqual({ userAgent: "*", allow: "/", disallow: [...DISALLOWED_PATHS] });
    expect(DISALLOWED_PATHS).toEqual(["/admin", "/api/", "/driver/", "/carrier/", "/verify", "/choose-role"]);
    expect(file.sitemap).toBe("https://fleetgridus.com/sitemap.xml");
    // The marketing pages, including /carriers (not /carrier/), stay crawlable.
    for (const path of PATHS) {
      expect(DISALLOWED_PATHS.some((blocked) => path.startsWith(blocked)), path).toBe(false);
    }
  });
});

describe("share images", () => {
  it("reads the active theme's colours from themes.css, all hex", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/themes.css"), "utf8");
    const tokens = parseActiveThemeTokens(css);
    const picked = ogTokens();
    for (const name of OG_TOKEN_NAMES) {
      expect(picked[name]).toBe(tokens[name]);
      expect(picked[name]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(() => parseActiveThemeTokens(":root { --x: 1; }")).toThrow("THEME 1 START");
    expect(() => parseActiveThemeTokens("/* ==== THEME 1 START ==== */")).toThrow("no :root block");
  });

  it("renders a 1200 by 630 PNG for a page, with its headline as the alt text", async () => {
    expect(ogAlt("/carriers")).toBe("FleetGrid: Fill open shifts with local CDL drivers.");
    const response = renderOgImage("/carriers");
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    expect({ width: view.getUint32(16), height: view.getUint32(20) }).toEqual(OG_SIZE);
  }, 30_000);
});
