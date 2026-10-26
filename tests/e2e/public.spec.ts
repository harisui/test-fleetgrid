import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PUBLIC_PAGES = [
  { path: "/", heading: "Local CDL drivers. Shifts filled by text." },
  { path: "/terms", heading: "Terms of Service" },
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/sms-terms", heading: "SMS Terms" },
  { path: "/login", heading: "What is your mobile number?" },
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
      // Light is the default, whatever the device prefers.
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(path);
      await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
      await expectNoAccessibilityViolations(page);
    });

    test(`${path} has no accessibility violations (dark)`, async ({ page }) => {
      await page
        .context()
        .addCookies([{ name: "fleetgrid-theme", value: "dark", url: "http://localhost:3000" }]);
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await expectNoAccessibilityViolations(page);
    });
  }

  test("the hero buttons lead to the driver login and the carriers page", async ({ page }) => {
    await page.goto("/");
    const hero = page.getByRole("region", { name: "Local CDL drivers. Shifts filled by text." });
    await hero.getByRole("link", { name: "Sign up to drive, free" }).click();
    await expect(page).toHaveURL(/\/login\?role=driver$/);

    await page.goto("/");
    await hero.getByRole("link", { name: "Find drivers" }).click();
    await expect(page).toHaveURL(/\/carriers$/);
  });

  test("footer links reach every legal page, and none of them is a placeholder", async ({
    page,
  }) => {
    await page.goto("/");
    const legal = page.getByRole("navigation", { name: "Legal" });

    await legal.getByRole("link", { name: "Terms", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
    await expect(page.locator("[data-slot=effective]")).toHaveText(/^Last updated /);
    await expect(page.getByRole("note")).toHaveCount(0);
    // The table of contents jumps to a section.
    await page
      .getByRole("navigation", { name: "On this page" })
      .getByRole("link", { name: "13. Governing law and dispute resolution" })
      .click();
    await expect(page).toHaveURL(/#governing-law-and-dispute-resolution$/);

    await legal.getByRole("link", { name: "Privacy" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    await expect(page.locator("[data-slot=effective]")).toHaveText(/^Last updated /);
    await expect(page.getByRole("note")).toHaveCount(0);

    await legal.getByRole("link", { name: "SMS Terms" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "SMS Terms" })).toBeVisible();
  });

  test("the landing page shows the company, the legal line and the opt-in line, as Twilio checks", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("FleetGrid LLC");
    await expect(footer.getByRole("link", { name: /@fleetgridus\.com$/ })).toBeVisible();
    await expect(footer).toContainText("8401 Mayland Dr. STE A");
    await expect(footer).toContainText("Richmond, VA 23294");
    await expect(footer).toContainText("FleetGrid is not an employer, staffing agency or freight broker.");
    await expect(footer.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");

    // The opt-in line under the hero buttons leads to the SMS Terms.
    const line = page.locator("[data-slot=sms-opt-in-line]");
    await expect(line).toContainText("Drivers can opt in to receive shift offers by text.");
    await line.getByRole("link", { name: "SMS Terms" }).click();
    await expect(page).toHaveURL(/\/sms-terms$/);
  });

  for (const path of ["/", "/terms", "/privacy", "/sms-terms"]) {
    test(`${path} carries no placeholder words`, async ({ page }) => {
      await page.goto(path);
      const text = await page.getByRole("main").innerText();
      expect(text).not.toMatch(/placeholder|coming soon|to be provided|lorem ipsum|pending legal/i);
    });
  }

  test("SMS terms link to the privacy policy, and the brand links home", async ({ page }) => {
    await page.goto("/sms-terms");
    await expect(page.getByText("Msg & data rates may apply")).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);

    // The wordmark in the header; the support email links also contain the name.
    await page.getByRole("banner").getByRole("link", { name: "FleetGrid" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("the landing page fits a 375px screen without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    for (const name of ["Find drivers", "Sign up to drive, free"]) {
      const box = await page.getByRole("link", { name }).first().boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("unknown pages show the not-found page", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  });
});
