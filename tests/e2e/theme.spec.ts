import { expect, test } from "@playwright/test";

const html = "html";

test.describe("dark mode", () => {
  test("defaults to the system setting", async ({ browser }) => {
    const dark = await browser.newContext({ colorScheme: "dark" });
    const darkPage = await dark.newPage();
    await darkPage.goto("/");
    await expect(darkPage.locator(html)).toHaveClass(/\bdark\b/);
    await dark.close();

    const light = await browser.newContext({ colorScheme: "light" });
    const lightPage = await light.newPage();
    await lightPage.goto("/");
    await expect(lightPage.locator(html)).not.toHaveClass(/\bdark\b/);
    await light.close();
  });

  test("toggle switches the theme and the choice survives a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.locator(html)).not.toHaveClass(/\bdark\b/);
    const lightBackground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );

    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(page.locator(html)).toHaveClass(/\bdark\b/);
    const darkBackground = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(darkBackground).not.toBe(lightBackground);

    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === "fleetgrid-theme")?.value).toBe("dark");

    await page.reload();
    await expect(page.locator(html)).toHaveClass(/\bdark\b/);

    await page.getByRole("button", { name: "Toggle dark mode" }).click();
    await expect(page.locator(html)).not.toHaveClass(/\bdark\b/);
    await page.reload();
    await expect(page.locator(html)).not.toHaveClass(/\bdark\b/);
  });
});
