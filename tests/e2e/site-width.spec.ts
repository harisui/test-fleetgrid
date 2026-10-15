import { expect, test } from "@playwright/test";

/**
 * The marketing site's width: one 80rem column with a 16, 24 or 32px gutter, shared by the
 * strip, the header, every section and the footer, and no horizontal scroll at any width
 * from a small phone to a wide monitor. Runs once, on the desktop project, and sets the
 * viewport itself.
 */

const PAGES = ["/", "/carriers", "/drivers", "/faq", "/contact", "/terms", "/privacy", "/sms-terms"];
const WIDTHS = [320, 390, 768, 1024, 1280, 1440, 1920];

/**
 * The widest box on the page, measured from the viewport's left edge. Screen-reader-only
 * wrappers clip their children to 1px, so what is inside them does not count.
 */
const widestEdge = () =>
  Math.max(
    document.documentElement.scrollWidth,
    ...[...document.querySelectorAll("body *")]
      .filter((el) => !el.closest(".sr-only"))
      .map((el) => Math.ceil(el.getBoundingClientRect().right)),
  );

test.describe("site width", () => {
  test.skip(({ isMobile }) => isMobile, "runs once, on the desktop project");

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const path of PAGES) {
    test(`${path} never scrolls sideways, from 320 to 1920px`, async ({ page }) => {
      await page.goto(path);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
        const edge = await page.evaluate(widestEdge);
        expect(edge, `${path} at ${width}px: widest box`).toBeLessThanOrEqual(width);
      }
    });
  }

  test("the strip, the header, the page and the footer line up on the one column at every width", async ({
    page,
  }) => {
    await page.goto("/");
    // The strip, the header, the page itself and the footer's two rows.
    const columns = page.locator("[data-slot=container], main#main-content");
    await expect(columns).toHaveCount(5);

    const measure = async () =>
      columns.evaluateAll((elements) =>
        elements.map((el) => {
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            left: Math.round(box.left),
            width: Math.round(box.width),
            gutter: parseFloat(style.paddingLeft),
          };
        }),
      );

    // A phone: edge to edge with the 16px gutter.
    await page.setViewportSize({ width: 390, height: 844 });
    for (const column of await measure()) {
      expect(column).toEqual({ left: 0, width: 390, gutter: 16 });
    }

    // A tablet: 24px gutter.
    await page.setViewportSize({ width: 768, height: 1024 });
    for (const column of await measure()) {
      expect(column).toEqual({ left: 0, width: 768, gutter: 24 });
    }

    // A laptop: the column fills the width with the 32px gutter.
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const column of await measure()) {
      expect(column).toEqual({ left: 0, width: 1280, gutter: 32 });
    }

    // A monitor: the column stops at 80rem (1280px) and sits in the middle.
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const column of await measure()) {
      expect(column).toEqual({ left: 80, width: 1280, gutter: 32 });
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
    for (const column of await measure()) {
      expect(column).toEqual({ left: 320, width: 1280, gutter: 32 });
    }
  });

  test("the home page lays out one column on a phone, two on a tablet and the full grids from 1024px", async ({
    page,
  }) => {
    await page.goto("/");
    const sides = page.getByRole("region", { name: "For carriers" });
    const driverSide = page.getByRole("region", { name: "For drivers" });
    const miles = page.getByRole("list", { name: "The four miles" }).getByRole("listitem");
    const promises = page.getByRole("region", { name: "Plain promises" }).getByRole("listitem");

    const tops = async (items: typeof miles) =>
      new Set((await items.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))).values()).size;

    await page.setViewportSize({ width: 390, height: 844 });
    expect((await sides.boundingBox())!.y).toBeLessThan((await driverSide.boundingBox())!.y);
    expect(await tops(miles)).toBe(4);

    await page.setViewportSize({ width: 768, height: 1024 });
    expect(Math.round((await sides.boundingBox())!.y)).toBe(Math.round((await driverSide.boundingBox())!.y));
    expect(await tops(miles)).toBe(2);
    expect(await tops(promises)).toBe(3);

    await page.setViewportSize({ width: 1280, height: 800 });
    expect(await tops(miles)).toBe(1);
    expect(await tops(promises)).toBe(1);
  });

  test("driver onboarding keeps its narrow column", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login?role=driver");
    const main = page.getByRole("main");
    expect((await main.boundingBox())!.width).toBeLessThanOrEqual(576);
    await expect(page.locator("[data-slot=container]")).toHaveCount(0);
  });
});
