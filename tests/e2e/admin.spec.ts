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

/** A 1 by 1 PNG, as a real file in storage so the signed links work. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** The CDL front, the CDL back and the medical card, uploaded as a driver would (CR-5). */
async function uploadRequiredDocuments(driverId: string) {
  const admin = adminClient();
  for (const type of ["cdl_front", "cdl_back", "medical_card"] as const) {
    const path = `${driverId}/${type}-${Date.now()}.png`;
    const upload = await admin.storage.from("driver-documents").upload(path, PNG, { contentType: "image/png" });
    if (upload.error) throw upload.error;
    const { error } = await admin.from("driver_documents").insert({
      driver_id: driverId,
      type,
      storage_path: path,
      file_name: `${type}.png`,
      mime_type: "image/png",
      size_bytes: PNG.length,
    });
    if (error) throw error;
  }
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

  test("Mark Roster-Ready waits for the documents, then lists the driver; block hides them; every step in the audit log", async ({
    page,
    browser,
  }) => {
    const { driverId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP);
    await login(page, PHONES.admin);
    await expect(page).toHaveURL(/\/admin\/drivers$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Drivers");
    const tiles = page.getByRole("region", { name: "Driver counts" });
    await expect(tiles.getByText("Registered", { exact: true })).toBeVisible();
    await expect(tiles.getByText("Roster-Ready", { exact: true })).toBeVisible();

    // Search narrows the list and lives in the URL.
    await page.getByRole("searchbox", { name: "Search" }).fill("Pat Driver");
    await page.getByRole("searchbox", { name: "Search" }).press("Enter");
    await expect(page).toHaveURL(/q=Pat\+Driver/);
    await expect(page.getByRole("link", { name: /^Search: Pat Driver/ })).toBeVisible();

    // The list shows the full number (user decision of 2026-10-28); the row opens the sheet.
    await expect(page.locator("main")).toContainText(displayPhone(PHONES.driver));
    await adminList(page, "Drivers").getByRole("link", { name: /^Pat Driver/ }).click();
    await expect(page).toHaveURL(new RegExp(`open=${driverId}`));
    const sheet = page.getByRole("dialog", { name: "Pat Driver" });
    await expect(sheet.locator("[data-slot=full-phone]")).toContainText(displayPhone(PHONES.driver));
    await expect(sheet.locator("[data-slot=driver-card]")).toContainText("Class A");
    await expect(sheet.locator("[data-slot=no-history]")).toBeVisible();
    await page.waitForTimeout(300);
    await expectNoAccessibilityViolations(page, "driver sheet");

    // No documents yet: Mark Roster-Ready waits, with the checklist saying what is missing.
    const mark = sheet.getByRole("button", { name: "Mark Roster-Ready" });
    await expect(mark).toBeDisabled();
    await expect(sheet.locator("[data-slot=approve-reason]")).toHaveText("Missing: CDL front photo, CDL back photo, Medical card.");
    await expect(sheet.locator("[data-slot=detail-badges] [data-status=pending]")).toHaveText("Registered");

    // The driver uploads the three; the admin sees them side by side with the note.
    await uploadRequiredDocuments(driverId!);
    await page.reload();
    await expect(sheet.locator("[data-slot=shift-ready-photos] img")).toHaveCount(3);
    await expect(sheet.locator("[data-slot=shift-ready-note]")).toHaveText("Check the name, state and expiry match the profile.");
    await page.waitForTimeout(300);
    await expectNoAccessibilityViolations(page, "driver sheet with the Roster-Ready review");
    await expect(mark).toBeEnabled();
    await mark.click();
    const approveDialog = page.getByRole("dialog", { name: "Mark Pat Driver Roster-Ready?" });
    await expect(approveDialog).toContainText("Subscribed carriers can find Pat Driver from now on");
    await approveDialog.getByRole("button", { name: "Mark Roster-Ready" }).click();
    await expect(page.getByText(/^Roster-Ready\./)).toBeVisible();
    await expect(sheet.locator("[data-slot=detail-badges] [data-status=approved]")).toHaveText("Roster-Ready");
    await expect(sheet.getByRole("list", { name: "History" })).toContainText("Marked Roster-Ready by");

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
    await expect(page.getByRole("link", { name: /^Status: Blocked/ })).toBeVisible();
    await page.getByRole("dialog", { name: "Pat Driver" }).getByRole("button", { name: "Move to Registered" }).click();
    await page.getByRole("dialog", { name: "Move Pat Driver to Registered?" }).getByRole("button", { name: "Move to Registered" }).click();
    await expect(page.getByText(/^Registered\. The driver is out of carrier search/)).toBeVisible();
    expect((await auditFor(driverId!)).map((entry) => entry.action)).toEqual(["driver_approved", "driver_blocked", "driver_reopened"]);

    // Closing the sheet keeps the filter.
    await page.getByRole("dialog", { name: "Pat Driver" }).getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL(/\/admin\/drivers\?status=blocked$/);
  });

  test("an unfinished card cannot be marked Roster-Ready, and the filters single it out", async ({ page }) => {
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
    const approve = sheet.getByRole("button", { name: "Mark Roster-Ready" });
    await expect(approve).toBeDisabled();
    await expect(sheet.locator("[data-slot=approve-reason]")).toHaveText(
      "Missing: CDL front photo, CDL back photo, Medical card, Profile not complete.",
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

  test("a CDL from outside Texas needs a typed reason, which the history keeps", async ({ page }) => {
    const { driverId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { cdl_state: "LA" });
    await uploadRequiredDocuments(driverId!);
    await login(page, PHONES.admin);
    await page.goto(`/admin/drivers?open=${driverId}`);
    const sheet = page.getByRole("dialog", { name: "Pat Driver" });
    const mark = sheet.getByRole("button", { name: "Mark Roster-Ready" });
    await expect(mark).toBeDisabled();
    await expect(sheet.locator("[data-slot=approve-reason]")).toHaveText("Type why a CDL from outside Texas is accepted.");
    await sheet.getByLabel(/Roster-Ready with a LA CDL state/).fill("Moving to Houston, Texas CDL booked for next week");
    await mark.click();
    await page.getByRole("dialog", { name: "Mark Pat Driver Roster-Ready?" }).getByRole("button", { name: "Mark Roster-Ready" }).click();
    await expect(page.getByText(/^Roster-Ready\./)).toBeVisible();
    await expect(sheet.getByRole("list", { name: "History" })).toContainText("override: Moving to Houston");
    const [entry] = (await auditFor(driverId!)).slice(-1);
    expect(entry).toMatchObject({ action: "driver_approved", detail: { cdlState: "LA", overrideReason: "Moving to Houston, Texas CDL booked for next week" } });
  });

  test("Mark as reviewed clears the flag on a Roster-Ready driver in the grace period, with no text", async ({ page }) => {
    const { driverId, userId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP);
    await uploadRequiredDocuments(driverId!);
    await adminClient().from("profiles").update({ status: "approved" }).eq("id", userId);
    await adminClient()
      .from("drivers")
      .update({ rereview_needed: true, roster_grace_until: new Date(Date.now() + 7 * 86_400_000).toISOString() })
      .eq("id", driverId!);
    const textsBefore = (await adminClient().from("sms_messages").select("id").eq("driver_id", driverId!)).data?.length;

    await login(page, PHONES.admin);
    await page.goto(`/admin/drivers?open=${driverId}`);
    const sheet = page.getByRole("dialog", { name: "Pat Driver" });
    await expect(sheet.locator("[data-slot=rereview]")).toBeVisible();
    await sheet.getByRole("button", { name: "Mark as reviewed" }).click();

    await expect(sheet.locator("[data-slot=rereview]")).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Mark as reviewed" })).toHaveCount(0);
    await expect(sheet.getByRole("list", { name: "History" })).toContainText("Marked as reviewed");
    const { data: profile } = await adminClient().from("profiles").select("status").eq("id", userId).single();
    const { data: driver } = await adminClient().from("drivers").select("rereview_needed, roster_grace_until").eq("id", driverId!).single();
    expect(profile?.status).toBe("approved");
    expect(driver?.rereview_needed).toBe(false);
    expect(driver?.roster_grace_until).not.toBeNull();
    expect((await adminClient().from("sms_messages").select("id").eq("driver_id", driverId!)).data?.length).toBe(textsBefore);

    // The three-dot menu brings the flag back; the driver stays Roster-Ready, with no text.
    await sheet.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Mark for re-review" }).click();
    await expect(sheet.locator("[data-slot=rereview]")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Mark as reviewed" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "More actions" })).toHaveCount(0);
    await expect(sheet.getByRole("list", { name: "History" })).toContainText("Marked for re-review");
    expect((await adminClient().from("profiles").select("status").eq("id", userId).single()).data?.status).toBe("approved");
    expect((await adminClient().from("drivers").select("rereview_needed").eq("id", driverId!).single()).data?.rereview_needed).toBe(true);
    expect((await adminClient().from("sms_messages").select("id").eq("driver_id", driverId!)).data?.length).toBe(textsBefore);
    await new AxeBuilder({ page }).include("[data-slot=sheet-content]").analyze().then(({ violations }) => expect(violations).toEqual([]));
  });

  test("a new CDL photo from a Roster-Ready driver sends them back to Registered with Re-review needed", async ({ page }) => {
    const { driverId, userId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP);
    await uploadRequiredDocuments(driverId!);
    await adminClient().from("profiles").update({ status: "approved" }).eq("id", userId);
    // The driver replaces the CDL front from the Documents page.
    await uploadRequiredDocuments(driverId!);
    await login(page, PHONES.admin);
    await page.goto("/admin/drivers?q=Pat+Driver");
    const list = adminList(page, "Drivers");
    await expect(list.getByText("Re-review needed").first()).toBeVisible();
    await expect(list.locator("[data-status=pending]").first()).toHaveText("Registered");
    await page.goto(`/admin/drivers?open=${driverId}`);
    const sheet = page.getByRole("dialog", { name: "Pat Driver" });
    await expect(sheet.locator("[data-slot=rereview]")).toBeVisible();
    await expect(sheet.getByRole("list", { name: "History" })).toContainText("Back to Registered for re-review by the system");
  });
});
