import { expect, test, type Page } from "@playwright/test";

/**
 * Search and sharing, as a crawler sees the pages: each public page has its own title,
 * description, canonical and share image; the structured data parses and has the types
 * the plan names; sitemap.xml and robots.txt render; and the rendered copy keeps the copy
 * rules (no dashes, no exclamation marks, no placeholders). Runs once, on the desktop
 * project.
 */

const PAGES: { path: string; types: string[] }[] = [
  { path: "/", types: ["Organization", "WebSite"] },
  { path: "/carriers", types: ["Organization", "WebSite", "BreadcrumbList", "Service"] },
  { path: "/drivers", types: ["Organization", "WebSite", "BreadcrumbList"] },
  { path: "/faq", types: ["Organization", "WebSite", "BreadcrumbList", "FAQPage"] },
  { path: "/contact", types: ["Organization", "WebSite", "BreadcrumbList"] },
  { path: "/terms", types: ["Organization", "WebSite", "BreadcrumbList"] },
  { path: "/privacy", types: ["Organization", "WebSite", "BreadcrumbList"] },
  { path: "/sms-terms", types: ["Organization", "WebSite", "BreadcrumbList"] },
];

async function head(page: Page) {
  const content = (selector: string) =>
    page.locator(selector).first().getAttribute("content", { timeout: 2_000 }).catch(() => null);
  return {
    title: await page.title(),
    description: await content('meta[name="description"]'),
    canonical: await page.locator('link[rel="canonical"]').getAttribute("href"),
    ogTitle: await content('meta[property="og:title"]'),
    ogUrl: await content('meta[property="og:url"]'),
    ogImage: await content('meta[property="og:image"]'),
    ogWidth: await content('meta[property="og:image:width"]'),
    ogAlt: await content('meta[property="og:image:alt"]'),
    twitterCard: await content('meta[name="twitter:card"]'),
    twitterImage: await content('meta[name="twitter:image"]'),
  };
}

async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((block) => {
    const parsed: unknown = JSON.parse(block);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((item: { "@type": string; "@context": string }) => {
      expect(item["@context"]).toBe("https://schema.org");
      return item["@type"];
    });
  });
}

test.describe("SEO", () => {
  test.skip(({ isMobile }) => isMobile, "runs once, on the desktop project");

  test("every public page has its own title, description, canonical and share cards", async ({ page, request }) => {
    const seen = { titles: new Set<string>(), descriptions: new Set<string>(), images: new Set<string>() };
    for (const { path } of PAGES) {
      await page.goto(path);
      const tags = await head(page);
      expect(tags.title, path).toMatch(/FleetGrid/);
      expect(tags.description, path).toBeTruthy();
      // Next writes the home URL without its trailing slash; both forms are the same page.
      const absolute = path === "/" ? "https://fleetgridus.com" : `https://fleetgridus.com${path}`;
      expect(tags.canonical, path).toBe(absolute);
      expect(tags.ogTitle, path).toBe(tags.title);
      expect(tags.ogUrl, path).toBe(absolute);
      expect(tags.ogWidth, path).toBe("1200");
      expect(tags.ogAlt, path).toMatch(/^FleetGrid: /);
      expect(tags.twitterCard, path).toBe("summary_large_image");
      expect(tags.twitterImage, path).toBeTruthy();
      seen.titles.add(tags.title);
      seen.descriptions.add(tags.description!);
      seen.images.add(new URL(tags.ogImage!).pathname);

      // The image itself: a PNG of the size the tags announce.
      const image = await request.get(new URL(tags.ogImage!).pathname + new URL(tags.ogImage!).search);
      expect(image.status(), `${path} og:image`).toBe(200);
      expect(image.headers()["content-type"]).toBe("image/png");
      const bytes = await image.body();
      expect(bytes.readUInt32BE(16), `${path} image width`).toBe(1200);
      expect(bytes.readUInt32BE(20), `${path} image height`).toBe(630);
    }
    expect(seen.titles.size).toBe(PAGES.length);
    expect(seen.descriptions.size).toBe(PAGES.length);
    expect(seen.images.size).toBe(PAGES.length);
  });

  test("the structured data parses and has the planned types on each page", async ({ page }) => {
    for (const { path, types } of PAGES) {
      await page.goto(path);
      expect((await jsonLdTypes(page)).sort(), path).toEqual([...types].sort());
    }
    // The FAQPage carries every question the page shows.
    await page.goto("/faq");
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const faq = blocks
      .flatMap((block) => [JSON.parse(block)].flat())
      .find((item: { "@type": string }) => item["@type"] === "FAQPage") as { mainEntity: { name: string }[] };
    const questions = await page.locator("main h3 button").allTextContents();
    expect(faq.mainEntity.map((question) => question.name)).toEqual(questions.map((text) => text.trim()));
  });

  test("sitemap.xml lists the public pages and robots.txt keeps crawlers out of the private ones", async ({ request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(urls).toEqual(PAGES.map(({ path }) => `https://fleetgridus.com${path}`));
    expect(xml).not.toMatch(/login|verify|admin|\/api|\/driver\/|\/carrier\//);

    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const text = await robots.text();
    expect(text).toContain("Allow: /");
    for (const path of ["/admin", "/api/", "/driver/", "/carrier/", "/verify", "/choose-role"]) {
      expect(text).toContain(`Disallow: ${path}`);
    }
    expect(text).toContain("Sitemap: https://fleetgridus.com/sitemap.xml");
  });

  test("the rendered copy keeps the copy rules on every page", async ({ page }) => {
    for (const { path } of PAGES) {
      await page.goto(path);
      const text = await page.locator("body").innerText();
      expect(text, `${path}: dash`).not.toMatch(/[–—]/);
      expect(text, `${path}: exclamation`).not.toMatch(/[A-Za-z]!/);
      expect(text, `${path}: placeholder`).not.toMatch(/\b(lorem|TODO|TBD|placeholder)\b|example\.com|555-/i);
      // The copyright sign counts as pictographic in Unicode; it is the footer's, not an emoji.
      expect(text, `${path}: emoji`).not.toMatch(/(?![©®™])\p{Extended_Pictographic}/u);
    }
  });
});
