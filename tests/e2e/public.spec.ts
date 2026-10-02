import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PUBLIC_PAGES = [
  { path: "/", heading: "Local freight shifts, filled fast" },
  { path: "/terms", heading: "Terms of Service" },
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/sms-terms", heading: "SMS Terms" },
  { path: "/login", heading: "Log in or sign up" },
];

async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    // The Next.js dev overlay is not part of the app.
    .exclude("nextjs-portal")
    .analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(summary).toEqual([]);
}

test.describe("public pages", () => {
  for (const { path, heading } of PUBLIC_PAGES) {
    test(`${path} renders`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page).toHaveTitle(/FleetGrid/);
    });

    test(`${path} has no accessibility violations (light)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto(path);
      await expectNoAccessibilityViolations(page);
    });

    test(`${path} has no accessibility violations (dark)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await expectNoAccessibilityViolations(page);
    });
  }

  test("landing buttons lead to login with the role carried along", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "I'm a Driver" }).click();
    await expect(page).toHaveURL(/\/login\?role=driver$/);

    await page.goto("/");
    await page.getByRole("link", { name: "I'm a Carrier" }).click();
    await expect(page).toHaveURL(/\/login\?role=carrier$/);
  });

  test("footer links reach every legal page", async ({ page }) => {
    await page.goto("/");
    const legal = page.getByRole("navigation", { name: "Legal" });

    await legal.getByRole("link", { name: "Terms", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
    await expect(page.getByRole("note")).toHaveText("Legal text to be provided by FleetGrid.");

    await legal.getByRole("link", { name: "Privacy" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    await expect(page.getByRole("note")).toHaveText("Legal text to be provided by FleetGrid.");

    await legal.getByRole("link", { name: "SMS Terms" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "SMS Terms" })).toBeVisible();
  });

  test("SMS terms link to the privacy policy, and the brand links home", async ({ page }) => {
    await page.goto("/sms-terms");
    await expect(page.getByText("Msg & data rates may apply")).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);

    await page.getByRole("link", { name: "FleetGrid" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("the landing page fits a 375px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    for (const name of ["I'm a Driver", "I'm a Carrier"]) {
      const box = await page.getByRole("link", { name }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("unknown pages show the not-found page", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  });
});
