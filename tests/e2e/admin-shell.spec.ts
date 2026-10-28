import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login, PHONES, resetUser, seedCarrier, seedDriverAtStep, seedUser } from "./helpers";

/**
 * The admin shell: the sidebar on a desktop, the menu sheet on a phone, keyboard reach, axe
 * in both themes, and the 403 for everyone who is not the admin.
 */

const ADMIN_PAGES = ["/admin/drivers", "/admin/analytics"] as const;

async function expectNoAccessibilityViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .exclude("nextjs-portal")
    .analyze();
  expect(
    results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.length })),
    label,
  ).toEqual([]);
}

test.describe("admin shell", () => {
  test.beforeEach(async () => {
    await seedUser(PHONES.admin, "admin", "approved");
  });

  test.afterAll(async () => {
    await resetUser(PHONES.driver);
    await resetUser(PHONES.carrier);
  });

  test("the home is Drivers; the sidebar holds the pages on a desktop and folds into a menu sheet on a phone", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop-chrome", "viewports are set by hand here");
    await login(page, PHONES.admin);
    await expect(page).toHaveURL(/\/admin\/drivers$/);

    await page.setViewportSize({ width: 1280, height: 900 });
    const sidebar = page.locator("[data-slot=admin-sidebar]");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Drivers" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("[data-slot=admin-mobile-bar]")).toBeHidden();
    await sidebar.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/admin\/analytics$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Analytics");
    await expect(sidebar.getByRole("link", { name: "Analytics" })).toHaveAttribute("aria-current", "page");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(sidebar).toBeHidden();
    const bar = page.locator("[data-slot=admin-mobile-bar]");
    await expect(bar).toBeVisible();
    await bar.getByRole("button", { name: "Menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name: "Drivers" }).click();
    await expect(page).toHaveURL(/\/admin\/drivers$/);
    await expect(sheet).toBeHidden();
  });

  test("the keyboard reaches every control: the skip link, the pages, Log out and the theme toggle", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop-chrome", "keyboard run once, on a desktop");
    await login(page, PHONES.admin);
    await page.setViewportSize({ width: 1280, height: 900 });
    const reached: string[] = [];
    for (let stop = 0; stop < 12; stop += 1) {
      await page.keyboard.press("Tab");
      const name = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el ? (el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "") : "";
      });
      reached.push(name);
      if (name === "Toggle dark mode") break;
    }
    for (const name of ["Skip to content", "Drivers", "Analytics", "Log out", "Toggle dark mode"]) {
      expect(reached, reached.join(" > ")).toContain(name);
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`every admin page passes axe (${colorScheme})`, async ({ page }) => {
      await page
        .context()
        .addCookies([{ name: "fleetgrid-theme", value: colorScheme, url: "http://localhost:3000" }]);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await login(page, PHONES.admin);
      for (const path of ADMIN_PAGES) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoAccessibilityViolations(page, `${path} ${colorScheme}`);
      }
      // The menu sheet on a phone, open.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/admin/drivers");
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
      await page.waitForTimeout(300);
      await expectNoAccessibilityViolations(page, `menu sheet ${colorScheme}`);
    });
  }

  test("a driver and a carrier get a 403 on every admin page; a visitor is sent to /login", async ({ page }) => {
    for (const path of ["/admin", ...ADMIN_PAGES]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
    }

    await seedDriverAtStep(PHONES.driver, 12);
    await login(page, PHONES.driver);
    for (const path of ADMIN_PAGES) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(403);
      await expect(page.getByRole("heading", { level: 1, name: "403" })).toBeVisible();
      await expect(page.getByText("Only FleetGrid staff can open this page.")).toBeVisible();
      await expect(page.locator("[data-slot=admin-sidebar]")).toHaveCount(0);
    }

    await page.context().clearCookies();
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
    await login(page, PHONES.carrier);
    const response = await page.goto("/admin/drivers");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { level: 1, name: "403" })).toBeVisible();
  });
});
