import { expect, test } from "@playwright/test";
import { login, PHONES, seedUser } from "./helpers";

/** The admin's orange page-load bar (user request of 2026-11-02). */
test.describe("admin page-load bar", () => {
  test.beforeEach(async () => {
    await seedUser(PHONES.admin, "admin", "approved");
  });

  test("creeps in the theme's orange while the next page loads, then goes away", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop-chrome", "once, on a desktop");
    await login(page, PHONES.admin);
    // Hold the next page's requests (the prefetch too) so the bar can be seen.
    await page.route("**/admin/carriers**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });
    await page.goto("/admin/drivers");
    const bar = page.locator("[data-slot=admin-progress] > div");
    await expect(bar).toHaveAttribute("data-state", "idle");
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Carriers" }).click();
    await expect(bar).toHaveAttribute("data-state", "loading");
    const [barColor, primary] = await bar.evaluate((el) => [
      getComputedStyle(el).backgroundColor,
      (() => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--primary)";
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      })(),
    ]);
    expect(barColor).toBe(primary);
    await page.waitForTimeout(400);
    await page.screenshot({ path: test.info().outputPath("admin-progress-loading.png"), clip: { x: 0, y: 0, width: 1280, height: 80 } });
    await page.waitForURL(/\/admin\/carriers/);
    await expect(bar).toHaveAttribute("data-state", "idle");
  });
});
