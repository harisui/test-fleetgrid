import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  CONSENT_TEXT,
  enterCode,
  login,
  OTP,
  PHONES,
  resetUser,
  seedDriverAtStep,
  seedUser,
  WRONG_OTP,
} from "./helpers";

/**
 * Self-service account deletion: a compliance requirement, so it is available to every
 * signed-in person, driver or carrier, behind a fresh code texted to the same number.
 */

/** Opens the dialog and asks for the code; the Supabase resend limit is respected by login(). */
async function startDeletion(page: Page) {
  await page.getByRole("button", { name: "Delete my account" }).click();
  // Supabase allows one code per number per second; the login just sent one.
  await page.waitForTimeout(1300);
  await page.getByRole("button", { name: "Text me a code" }).click();
  await expect(page.getByRole("dialog")).toContainText("Enter the code to delete your account");
}

test.describe("delete my account", () => {
  test.afterAll(async () => {
    await resetUser(PHONES.driver);
    await resetUser(PHONES.carrier);
  });

  test("a driver's files, card, profile and sign-in go, and the number can sign up again", async ({
    page,
  }) => {
    const { userId, driverId } = await seedDriverAtStep(PHONES.driver, 13);
    const admin = adminClient();
    const path = `${driverId}/00000000-0000-4000-8000-000000000001.png`;
    await admin.storage
      .from("driver-documents")
      .upload(path, Buffer.from("not really a png"), { contentType: "image/png" });
    await admin.from("driver_documents").insert({
      driver_id: driverId!,
      type: "cdl_front",
      storage_path: path,
      file_name: "cdl.png",
      mime_type: "image/png",
      size_bytes: 16,
    });

    // The consent record this driver gave (seeded here, written by onboarding in real life).
    await admin.from("sms_consent_log").delete().eq("phone", PHONES.driver);
    await admin.from("sms_consent_log").insert({
      phone: PHONES.driver,
      event: "opt_in",
      consent_text: CONSENT_TEXT,
      consent_version: "2026-10-v1",
      source: "onboarding",
    });

    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/driver\/profile$/);
    await startDeletion(page);
    await enterCode(page, OTP);
    await page.getByRole("button", { name: "Delete for good" }).click();
    await expect(page).toHaveURL(/\/login$/);

    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    expect(users?.users.some((user) => user.id === userId)).toBe(false);
    const { data: profiles } = await admin.from("profiles").select("id").eq("id", userId);
    expect(profiles).toEqual([]);
    const { data: files } = await admin.storage.from("driver-documents").list(driverId!);
    expect(files ?? []).toEqual([]);
    // Everything about the person is gone, except the proof of consent.
    const { data: consent } = await admin
      .from("sms_consent_log")
      .select("event, consent_text")
      .eq("phone", PHONES.driver);
    expect(consent).toEqual([{ event: "opt_in", consent_text: CONSENT_TEXT }]);

    // The number is free again: the next login is a fresh sign-up.
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/choose-role/);
  });

  test("a carrier who picked the wrong role can delete the account and start over", async ({
    page,
  }) => {
    const userId = await seedUser(PHONES.carrier, "carrier");
    await login(page, PHONES.carrier);
    await expect(page).toHaveURL(/\/carrier$/);

    await startDeletion(page);
    await enterCode(page, OTP);
    await page.getByRole("button", { name: "Delete for good" }).click();
    await expect(page).toHaveURL(/\/login$/);

    const { data: profiles } = await adminClient().from("profiles").select("id").eq("id", userId);
    expect(profiles).toEqual([]);

    await login(page, PHONES.carrier);
    await expect(page).toHaveURL(/\/choose-role/);
    await page.getByRole("radio", { name: /I drive or work trucks/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/driver\/onboarding$/);
  });

  test("a wrong code keeps the account, and cancelling sends nothing", async ({ page }) => {
    const userId = await seedUser(PHONES.carrier, "carrier");
    await login(page, PHONES.carrier);

    await startDeletion(page);
    await enterCode(page, WRONG_OTP);
    await page.getByRole("button", { name: "Delete for good" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
      "That code is incorrect or has expired",
    );
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const { data: profiles } = await adminClient().from("profiles").select("id").eq("id", userId);
    expect(profiles).toHaveLength(1);
    await page.reload();
    await expect(page).toHaveURL(/\/carrier$/);
  });
});
