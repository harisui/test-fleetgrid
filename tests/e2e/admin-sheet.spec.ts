import { expect, test } from "@playwright/test";
import { adminClient, COMPLETE_STEP, login, PHONES, resetUser, seedDriverAtStep, seedUser } from "./helpers";

/**
 * A long detail sheet has one scroll area, between its fixed header and footer. Hidden text for
 * screen readers on a document link must not stretch the sheet into a second one.
 */
test.describe("the admin detail sheet", () => {
  test.beforeEach(async () => {
    await resetUser(PHONES.admin);
    await resetUser(PHONES.driver);
    await seedUser(PHONES.admin, "admin", "approved");
    await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { full_name: "Sheet Check" });
  });

  test.afterAll(async () => {
    await resetUser(PHONES.driver);
    await resetUser(PHONES.admin);
  });

  test("a driver with documents: one scroll area, and the header and footer stay put", async ({ page }) => {
    const admin = adminClient();
    const { data: driver } = await admin.from("drivers").select("id").eq("full_name", "Sheet Check").single();
    const { error } = await admin.from("driver_documents").insert(
      (["cdl_front", "cdl_back", "medical_card"] as const).map((type) => ({
        driver_id: driver!.id,
        type,
        storage_path: `${driver!.id}/${type}.png`,
        file_name: `${type}.png`,
        mime_type: "image/png",
        size_bytes: 68,
      })),
    );
    if (error) throw new Error(error.message);

    await page.setViewportSize({ width: 1400, height: 700 });
    await login(page, PHONES.admin);
    await page.goto(`/admin/drivers?open=${driver!.id}`);
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("CDL (front)").first()).toBeVisible();

    const sizes = await sheet.evaluate((root) => ({ scrollHeight: root.scrollHeight, clientHeight: root.clientHeight }));
    console.log("SHEET", JSON.stringify(sizes));
    expect(sizes.scrollHeight).toBe(sizes.clientHeight);
  });
});
