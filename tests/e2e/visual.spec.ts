import { expect, test } from "@playwright/test";

/**
 * Visual snapshots of the marketing pages at 390, 1280 and 1440px in light, and at 1280 in
 * dark, with motion off so every block is drawn and the hero sits on its final frame. The
 * baselines live in tests/e2e/__screenshots__ and were rendered on Windows Chromium; CI
 * (Linux) skips the comparison (ignoreSnapshots in playwright.config.ts). Refresh them with
 * `pnpm exec playwright test visual --update-snapshots` after an intended change.
 */

const PAGES = ["/", "/carriers", "/drivers", "/faq", "/contact", "/terms"];
const WIDTHS = [390, 1280, 1440];

function slug(path: string) {
  return path === "/" ? "home" : path.slice(1);
}

test.describe("visual snapshots", () => {
  test.skip(({ isMobile }) => isMobile, "runs once, on the desktop project");

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // The Next.js dev badge is not part of the site.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "nextjs-portal{display:none !important}";
        document.head.append(style);
      });
    });
  });

  for (const path of PAGES) {
    for (const width of WIDTHS) {
      test(`${path} at ${width}px, light`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page).toHaveScreenshot(`${slug(path)}-${width}-light.png`, { fullPage: true });
      });
    }

    test(`${path} at 1280px, dark`, async ({ page, baseURL }) => {
      await page.context().addCookies([{ name: "fleetgrid-theme", value: "dark", url: baseURL! }]);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await expect(page).toHaveScreenshot(`${slug(path)}-1280-dark.png`, { fullPage: true });
    });
  }
});
