import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("landing page loads", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "FleetGrid" })).toBeVisible();
  });

  test("health endpoint responds", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ ok: true });
  });
});
