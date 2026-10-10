import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("landing page loads", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The wordmark in the header; the support email links also contain the name.
    await expect(
      page.getByRole("banner").getByRole("link", { name: "FleetGrid", exact: true }),
    ).toBeVisible();
  });

  test("health endpoint responds", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ ok: true });
  });
});
