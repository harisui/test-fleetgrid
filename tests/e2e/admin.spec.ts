import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  adminList,
  COMPLETE_STEP,
  displayPhone,
  login,
  PHONES,
  resetUser,
  seedCarrier,
  seedDriverAtStep,
  seedUser,
} from "./helpers";

/**
 * The Drivers page: the tiles, the list with its filters and search in the URL, the detail
 * sheet, and Approve and Block through their dialogs, each written to the audit log. An
 * approved driver appears in a subscribed carrier's search; a blocked one vanishes and is
 * signed out; an unfinished card cannot be approved.
 */

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

const auditFor = async (driverId: string) => {
  const { data } = await adminClient()
    .from("admin_audit_log")
    .select("action, admin_phone, detail")
    .eq("target_type", "driver")
    .eq("target_id", driverId)
    .order("created_at", { ascending: true });
  return data ?? [];
};

test.describe("admin drivers", () => {
  test.beforeEach(async () => {
    // Recreates the seeded admin with the same number; other specs rely on it existing.
    await seedUser(PHONES.admin, "admin", "approved");
  });

  test.afterAll(async () => {
    await resetUser(PHONES.driver);
    await resetUser(PHONES.secondDriver);
    await resetUser(PHONES.carrier);
  });

  test("approve lists a driver to carriers, block hides and signs them out, every step in the audit log", async ({
    page,
    browser,
  }) => {
    const { driverId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP);
    await login(page, PHONES.admin);
    await expect(page).toHaveURL(/\/admin\/drivers$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Drivers");
    const tiles = page.getByRole("region", { name: "Driver counts" });
    await expect(tiles.getByText("Pending")).toBeVisible();

    // Search narrows the list and lives in the URL.
    await page.getByRole("searchbox", { name: "Search" }).fill("Pat Driver");
    await page.getByRole("searchbox", { name: "Search" }).press("Enter");
    await expect(page).toHaveURL(/q=Pat\+Driver/);
    await expect(page.getByRole("link", { name: /^Search: Pat Driver/ })).toBeVisible();

    // The row opens the sheet with the full number; the list shows it masked.
    await expect(page.locator("main")).not.toContainText(displayPhone(PHONES.driver));
    await adminList(page, "Drivers").getByRole("link", { name: /^Pat Driver/ }).click();
    await expect(page).toHaveURL(new RegExp(`open=${driverId}`));
    const sheet = page.getByRole("dialog", { name: "Pat Driver" });
    await expect(sheet.locator("[data-slot=full-phone]")).toContainText(displayPhone(PHONES.driver));
    await expect(sheet.locator("[data-slot=driver-card]")).toContainText("Class A");
    await expect(sheet.locator("[data-slot=no-history]")).toBeVisible();
    await page.waitForTimeout(300);
    await expectNoAccessibilityViolations(page, "driver sheet");

    await sheet.getByRole("button", { name: "Approve" }).click();
    const approveDialog = page.getByRole("dialog", { name: "Approve Pat Driver?" });
    await expect(approveDialog).toContainText("Subscribed carriers can find Pat Driver from now on.");
    await approveDialog.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText(/^Approved\./)).toBeVisible();
    await expect(sheet.locator("[data-slot=detail-badges] [data-status=approved]")).toBeVisible();
    await expect(sheet.getByRole("list", { name: "History" })).toContainText("Approved by");

    const admin = adminClient();
    const { data: approved } = await admin.from("profiles").select("status").eq("phone", PHONES.driver).single();
    expect(approved?.status).toBe("approved");
    expect(await auditFor(driverId!)).toEqual([
      expect.objectContaining({ action: "driver_approved", admin_phone: PHONES.admin, detail: expect.objectContaining({ from: "pending", to: "approved" }) }),
    ]);

    // A subscribed carrier finds the driver now.
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
    const carrierPage = await (await browser.newContext()).newPage();
    await login(carrierPage, PHONES.carrier);
    await expect(carrierPage).toHaveURL(/\/carrier\/search$/);
    await expect(carrierPage.getByRole("link", { name: /Pat Driver/ }).first()).toBeVisible();

    // Blocking hides the driver again and ends their session.
    await sheet.getByRole("button", { name: "Block" }).click();
    const blockDialog = page.getByRole("dialog", { name: "Block Pat Driver?" });
    await expect(blockDialog).toContainText("Pat Driver will be signed out and hidden from carriers.");
    await blockDialog.getByRole("button", { name: "Block" }).click();
    await expect(page.getByText(/^Blocked\./)).toBeVisible();
    const { data: blocked } = await admin.from("profiles").select("status").eq("phone", PHONES.driver).single();
    expect(blocked?.status).toBe("blocked");
    await carrierPage.reload();
    await expect(carrierPage.getByRole("link", { name: /Pat Driver/ })).toHaveCount(0);
    await carrierPage.context().close();
    expect((await auditFor(driverId!)).map((entry) => entry.action)).toEqual(["driver_approved", "driver_blocked"]);

    // Back to the queue, from the Blocked filter.
    await page.goto(`/admin/drivers?status=blocked&open=${driverId}`);
    await expect(page.getByRole("link", { name: /^Review: Blocked/ })).toBeVisible();
    await page.getByRole("dialog", { name: "Pat Driver" }).getByRole("button", { name: "Set pending" }).click();
    await page.getByRole("dialog", { name: "Put Pat Driver back in review?" }).getByRole("button", { name: "Set pending" }).click();
    await expect(page.getByText("Back in the review queue.")).toBeVisible();
    expect((await auditFor(driverId!)).map((entry) => entry.action)).toEqual(["driver_approved", "driver_blocked", "driver_reopened"]);

    // Closing the sheet keeps the filter.
    await page.getByRole("dialog", { name: "Pat Driver" }).getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL(/\/admin\/drivers\?status=blocked$/);
  });

  test("an unfinished card cannot be approved, and the filters single it out", async ({ page }) => {
    await seedDriverAtStep(PHONES.driver, COMPLETE_STEP);
    const { driverId } = await seedDriverAtStep(PHONES.secondDriver, 3);
    await login(page, PHONES.admin);

    await page.goto("/admin/drivers?complete=incomplete");
    await expect(page.getByRole("link", { name: /^Profile: Incomplete/ })).toBeVisible();
    const table = adminList(page, "Drivers");
    await expect(table.getByText("Incomplete")).toBeVisible();
    await expect(table.getByText("Complete", { exact: true })).toHaveCount(0);

    await page.goto(`/admin/drivers?open=${driverId}`);
    const sheet = page.getByRole("dialog", { name: "Pat Driver" });
    const approve = sheet.getByRole("button", { name: "Approve" });
    await expect(approve).toBeDisabled();
    await expect(sheet.locator("[data-slot=approve-reason]")).toHaveText(
      "This driver has not finished their card, so they cannot be approved yet.",
    );
    await expect(sheet.getByRole("button", { name: "Block" })).toBeEnabled();
    await page.waitForTimeout(300);
    await expectNoAccessibilityViolations(page, "incomplete driver sheet");

    // In area and complete: only the finished Houston card.
    await page.goto("/admin/drivers?area=in&complete=complete");
    await expect(page.getByRole("link", { name: /^Area: In the service area/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Profile: Complete/ })).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/admin\/drivers$/);
  });

  test("only admins see the drivers; a driver gets a 403", async ({ page }) => {
    await seedDriverAtStep(PHONES.driver, COMPLETE_STEP);
    await login(page, PHONES.driver);
    const response = await page.goto("/admin/drivers");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { level: 1, name: "403" })).toBeVisible();
  });
});
