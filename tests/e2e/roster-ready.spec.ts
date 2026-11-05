import AxeBuilder from "@axe-core/playwright";
import { formatInTimeZone } from "date-fns-tz";
import { expect, test, type Page } from "@playwright/test";
import { docReminderText, welcomeText } from "../../src/content/sms-samples";
import { phoneHash } from "../../src/lib/sms/driverTexts";
import {
  adminClient,
  adminList,
  COMPLETE_STEP,
  CONSENT_TEXT,
  login,
  makeShiftReady,
  nextButton,
  PHONES,
  PLACES,
  resetUser,
  screenHeading,
  seedCarrier,
  seedDriverAtStep,
  seedUser,
  signUp,
} from "./helpers";

/**
 * CR-5 parts 4 to 6 in the browser: the driver's banners with what is missing, the welcome
 * text once per number, the documents reminder from the sheet and in bulk (SEND {N}, quiet
 * hours), the admin's badges, filters and tiles, and what a carrier reads on a driver's page.
 * The texts go to the fake sender (SMS_TEST_MODE). Quiet hours depend on the clock, so each
 * text test checks the branch that applies when it runs.
 */

const SEED_DRIVER_PHONE = "+15555551001";

const quietNow = () => {
  const hour = Number(formatInTimeZone(new Date(), "America/Chicago", "H"));
  return hour >= 21 || hour < 7;
};

async function expectNoAccessibilityViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .exclude("nextjs-portal")
    .analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")) })),
    label,
  ).toEqual([]);
}

async function textsTo(phone: string, kind: string): Promise<string[]> {
  const { data } = await adminClient()
    .from("sms_messages")
    .select("body")
    .eq("direction", "outbound")
    .eq("to_phone", phone)
    .eq("kind", kind)
    .order("created_at");
  return (data ?? []).map((row) => row.body);
}

/** Reminders stamp every driver a bulk send reaches, seed drivers too (local test data only). */
async function clearReminders() {
  const admin = adminClient();
  await admin.from("sms_messages").delete().eq("kind", "doc_reminder");
  await admin.from("notice_batches").delete().eq("category", "doc_reminder");
  await admin.from("drivers").update({ last_doc_reminder_at: null }).not("last_doc_reminder_at", "is", null);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`the driver's banner (${colorScheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.context().addCookies([{ name: "fleetgrid-theme", value: colorScheme, url: "http://localhost:3000" }]);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await resetUser(PHONES.driver);
    });

    test.afterAll(async () => {
      await resetUser(PHONES.driver);
    });

    test("Registered shows what is missing and links to it; Roster-Ready says texts will come", async ({ page }) => {
      const { userId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { full_name: "Bea Banner" });
      await login(page, PHONES.driver);
      await page.goto("/driver");

      const banner = page.locator("[data-slot=roster-status]");
      await expect(banner).toContainText("Upload your CDL and medical card to start getting shift offers.");
      const missing = banner.getByRole("list", { name: "What is missing" }).getByRole("link");
      await expect(missing).toHaveText(["CDL front photo", "CDL back photo", "Medical card"]);
      await expectNoAccessibilityViolations(page, "registered banner");

      await banner.getByRole("link", { name: "Medical card" }).click();
      await expect(page).toHaveURL(/\/driver\/documents\?type=medical_card$/);
      await expect(page.getByText("Only you and FleetGrid staff can see your documents. A company you book a shift with can view your CDL and medical card for that shift.")).toBeVisible();
      await expect(page.getByRole("combobox", { name: "Document type" })).toHaveText(/Medical card/);

      await page.goto("/driver/profile");
      await expect(banner).toContainText("Upload your CDL and medical card");

      await makeShiftReady(userId);
      await page.goto("/driver");
      await expect(banner).toHaveText("You're Roster-Ready. We'll text you when matching shifts open.");
      await expect(page.locator("main")).not.toContainText("Shift-Ready");
      await expectNoAccessibilityViolations(page, "roster-ready banner");

      await page.goto("/driver/profile");
      await expect(banner).toHaveText("You're Roster-Ready. We'll text you when matching shifts open.");
    });

    test("a driver in the grace period stays Roster-Ready and sees the date and what to add", async ({ page }) => {
      const { userId, driverId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { full_name: "Gia Grace" });
      await makeShiftReady(userId);
      const admin = adminClient();
      await admin.from("drivers").update({ roster_grace_until: new Date(Date.now() + 14 * 86_400_000).toISOString() }).eq("id", driverId!);
      await admin.from("driver_documents").delete().eq("driver_id", driverId!).eq("type", "medical_card");
      const { data: profile } = await admin.from("profiles").select("status").eq("id", userId).single();
      expect(profile?.status).toBe("approved");

      await login(page, PHONES.driver);
      await page.goto("/driver");
      const banner = page.locator("[data-slot=roster-status]");
      await expect(banner).toContainText(/Add these by .+ to stay Roster-Ready:/);
      await expect(banner.getByRole("list", { name: "What is missing" }).getByRole("link")).toHaveText(["Medical card"]);
      await expectNoAccessibilityViolations(page, "grace banner");

      await seedUser(PHONES.admin, "admin", "approved");
      await page.context().clearCookies();
      await page.context().addCookies([{ name: "fleetgrid-theme", value: colorScheme, url: "http://localhost:3000" }]);
      await login(page, PHONES.admin);
      await page.goto("/admin/drivers?docs=update&q=Gia+Grace");
      await expect(adminList(page, "Drivers")).toContainText(/Needs update by .+: Medical card/);
      await expectNoAccessibilityViolations(page, "needs update badge");
    });

    test("Roster-Ready with texts off is pointed to the profile", async ({ page }) => {
      const { userId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, {
        full_name: "Quinn Quiet",
        sms_opt_in: false,
        sms_opt_in_at: null,
        sms_opt_in_text: null,
      });
      await makeShiftReady(userId);
      await login(page, PHONES.driver);
      await page.goto("/driver");
      const link = page.locator("[data-slot=roster-status]").getByRole("link", { name: "Turn on texts in your profile to get shift offers." });
      await link.click();
      await expect(page).toHaveURL(/\/driver\/profile$/);
    });
  });
}

test.describe("the welcome text", () => {
  const hash = phoneHash(PHONES.driver);

  const clear = async () => {
    await adminClient().from("welcome_texts").delete().eq("phone_hash", hash);
    await adminClient().from("sms_messages").delete().eq("kind", "welcome").eq("to_phone", PHONES.driver);
  };

  /** Signs up through the page as far as the first screen, with or without the texts box. */
  async function saveLead(page: Page, consent: boolean) {
    await signUp(page, PHONES.driver, "driver");
    await expect(screenHeading(page)).toHaveText("About");
    await page.getByLabel("Full name").fill("Wes Welcome");
    await page.getByLabel("ZIP code", { exact: true }).fill(PLACES.houston.zip);
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Houston, TX");
    await page.getByRole("radio", { name: /Class A/ }).click();
    if (consent) await page.getByRole("checkbox", { name: new RegExp(CONSENT_TEXT.slice(0, 30)) }).click();
    await nextButton(page, "Save and continue").click();
    await expect(screenHeading(page)).toHaveText("Driving");
  }

  test.beforeEach(async () => {
    await resetUser(PHONES.driver);
    await clear();
  });

  test.afterAll(async () => {
    await resetUser(PHONES.driver);
    await clear();
  });

  test("goes once per number, even after the account is deleted and signed up again", async ({ page, context }) => {
    await saveLead(page, true);
    const { data: first } = await adminClient().from("welcome_texts").select("sent_at, due_at").eq("phone_hash", hash).single();
    if (quietNow()) {
      // Held for 7 AM: queued, nothing sent.
      expect(first?.sent_at).toBeNull();
      expect(new Date(first!.due_at).getTime()).toBeGreaterThan(Date.now());
      expect(await textsTo(PHONES.driver, "welcome")).toEqual([]);
    } else {
      expect(first?.sent_at).not.toBeNull();
      expect(await textsTo(PHONES.driver, "welcome")).toEqual([welcomeText("Wes")]);
    }

    await resetUser(PHONES.driver);
    await context.clearCookies();
    await saveLead(page, true);
    const { data: rows } = await adminClient().from("welcome_texts").select("phone_hash").eq("phone_hash", hash);
    expect(rows).toHaveLength(1);
    expect((await textsTo(PHONES.driver, "welcome")).length).toBeLessThanOrEqual(1);
  });

  test("never goes without the box ticked", async ({ page }) => {
    await saveLead(page, false);
    const { data } = await adminClient().from("welcome_texts").select("phone_hash").eq("phone_hash", hash);
    expect(data).toEqual([]);
    expect(await textsTo(PHONES.driver, "welcome")).toEqual([]);
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`the admin's documents tools (${colorScheme})`, () => {
    let driverId: string;

    test.beforeEach(async ({ page }) => {
      await page.context().addCookies([{ name: "fleetgrid-theme", value: colorScheme, url: "http://localhost:3000" }]);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await seedUser(PHONES.admin, "admin", "approved");
      await resetUser(PHONES.driver);
      await clearReminders();
      const seeded = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { full_name: "Rae Reminder" });
      driverId = seeded.driverId!;
      await adminClient().from("driver_documents").insert({
        driver_id: driverId,
        type: "cdl_front",
        storage_path: `${driverId}/cdl_front.png`,
        file_name: "cdl_front.png",
        mime_type: "image/png",
        size_bytes: 68,
      });
    });

    test.afterAll(async () => {
      await clearReminders();
      await resetUser(PHONES.driver);
    });

    test("the filter bar: every label on one line, boxes in line, and choosing Any clears a filter", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await login(page, PHONES.admin);
      await page.goto("/admin/drivers?status=blocked");
      const bar = page.getByRole("form", { name: "Filters" });
      const boxes = bar.getByRole("combobox");
      await expect(boxes).toHaveCount(8);
      const tops = await boxes.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
      const widths = await boxes.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().width)));
      expect(new Set(tops).size).toBeLessThanOrEqual(2);
      expect(new Set(widths).size).toBe(1);
      const search = await page.getByRole("searchbox", { name: "Search" }).boundingBox();
      expect(search!.width).toBeGreaterThan(400);
      await expect(bar.getByRole("combobox", { name: "Profile" })).toHaveText(/Any profile/);

      await bar.getByRole("combobox", { name: "Status" }).click();
      await page.getByRole("option", { name: "Any status" }).click();
      await bar.getByRole("button", { name: "Apply" }).click();
      await expect(page.getByRole("link", { name: /^Status:/ })).toHaveCount(0);
      await expect(page).not.toHaveURL(/status=blocked/);
    });

    test("the badge, the filters and the tiles", async ({ page }) => {
      await login(page, PHONES.admin);
      await page.goto("/admin/drivers?q=Rae+Reminder");
      const tiles = page.getByRole("region", { name: "Driver counts" });
      await expect(tiles.getByText("Missing documents", { exact: true })).toBeVisible();
      await expect(tiles.getByText("Reminders sent", { exact: true })).toBeVisible();
      await expect(adminList(page, "Drivers")).toContainText("Missing: CDL / medical card");
      await expectNoAccessibilityViolations(page, "drivers with badges");

      await page.goto("/admin/drivers?q=Rae+Reminder&docs=medical");
      await expect(adminList(page, "Drivers")).toContainText("Rae Reminder");
      await page.goto("/admin/drivers?q=Rae+Reminder&rereview=yes");
      await expect(page.getByText("No drivers match these filters.")).toBeVisible();

      await adminClient().from("drivers").update({ rereview_needed: true }).eq("id", driverId);
      await page.goto("/admin/drivers?q=Rae+Reminder&rereview=yes");
      await expect(adminList(page, "Drivers")).toContainText("Rae Reminder");

      await page.goto("/admin/analytics");
      await expect(page.getByRole("region", { name: "Sign-ups" }).getByText("Roster-Ready", { exact: true })).toBeVisible();
    });

    test("one driver from the sheet: the exact text, then the 3-day limit", async ({ page }) => {
      const expected = docReminderText("CDL photos and medical card");
      await login(page, PHONES.admin);
      await page.goto(`/admin/drivers?open=${driverId}`);
      const button = page.getByRole("button", { name: "Send documents reminder" });
      await button.click();
      const dialog = page.getByRole("dialog", { name: "Send the documents reminder to Rae Reminder?" });
      await expect(dialog.locator("[data-slot=doc-reminder-body]")).toHaveText(expected);
      await expectNoAccessibilityViolations(page, "reminder dialog");

      if (quietNow()) {
        await expect(dialog.locator("[data-slot=doc-reminder-sends-at]")).toContainText("7:00 AM");
        await dialog.getByRole("button", { name: "Queue for 7:00 AM" }).click();
        await expect(dialog).toBeHidden();
        expect(await textsTo(PHONES.driver, "doc_reminder")).toEqual([]);
        const { data } = await adminClient().from("notice_batches").select("status, send_after, body").eq("category", "doc_reminder");
        expect(data).toEqual([expect.objectContaining({ status: "queued", body: expected })]);
        expect(data?.[0]?.send_after).not.toBeNull();
      } else {
        await dialog.getByRole("button", { name: "Send reminder" }).click();
        await expect(dialog).toBeHidden();
        expect(await textsTo(PHONES.driver, "doc_reminder")).toEqual([expected]);
        await expect(button).toBeDisabled();
        await expect(button).toHaveAccessibleDescription("A documents reminder went to this driver in the last 3 days.");
      }
    });

    test("the reminder waits out 3 days, and says why", async ({ page }) => {
      await adminClient().from("drivers").update({ last_doc_reminder_at: new Date().toISOString() }).eq("id", driverId);
      await login(page, PHONES.admin);
      await page.goto(`/admin/drivers?open=${driverId}`);
      const button = page.getByRole("button", { name: "Send documents reminder" });
      await expect(button).toBeDisabled();
      await expect(button).toHaveAccessibleDescription("A documents reminder went to this driver in the last 3 days.");
    });

    test("in bulk: the count, who is left out, and SEND {N}", async ({ page }) => {
      await login(page, PHONES.admin);
      await page.goto("/admin/drivers");
      await page.getByRole("button", { name: "Remind all drivers missing documents" }).click();
      const dialog = page.getByRole("dialog", { name: "Remind all drivers missing documents?" });
      await expect(dialog.locator("[data-slot=doc-reminder-recipients]")).toContainText("will receive this");
      await expect(dialog.locator("[data-slot=doc-reminder-excluded]")).toContainText("Left out:");

      const box = dialog.getByLabel(/^Type SEND \d+ to send/);
      const label = (await dialog.locator("label").filter({ hasText: /^Type SEND/ }).innerText()).replace(/\s+/g, " ");
      const phrase = /SEND \d+/.exec(label)![0];
      const send = dialog.getByRole("button", { name: /Send reminders|Queue for 7:00 AM/ });
      await expect(send).toBeDisabled();
      await box.fill("SEND 99999");
      await expect(send).toBeDisabled();
      await expectNoAccessibilityViolations(page, "bulk reminder dialog");
      await box.fill(phrase);
      await expect(send).toBeEnabled();
      await send.click();
      await expect(dialog).toBeHidden();

      const { data } = await adminClient().from("notice_batches").select("status, recipient_count").eq("category", "doc_reminder");
      expect(data).toHaveLength(1);
      if (quietNow()) {
        expect(data?.[0]?.status).toBe("queued");
        expect(await textsTo(PHONES.driver, "doc_reminder")).toEqual([]);
      } else {
        expect(data?.[0]?.status).toBe("sent");
        expect(await textsTo(PHONES.driver, "doc_reminder")).toEqual([docReminderText("CDL photos and medical card")]);
      }
      const { data: audit } = await adminClient()
        .from("admin_audit_log")
        .select("action")
        .in("action", ["doc_reminder_sent", "doc_reminder_queued"])
        .order("created_at", { ascending: false })
        .limit(1);
      expect(audit?.[0]?.action).toBe(quietNow() ? "doc_reminder_queued" : "doc_reminder_sent");
    });
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`what a carrier reads (${colorScheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.context().addCookies([{ name: "fleetgrid-theme", value: colorScheme, url: "http://localhost:3000" }]);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await resetUser(PHONES.carrier);
      await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
    });

    test.afterAll(async () => {
      await resetUser(PHONES.carrier);
    });

    test("Documented profile and Self-reported on a driver's page, never on the search", async ({ page }) => {
      const admin = adminClient();
      const { data: profile } = await admin.from("profiles").select("id").eq("phone", SEED_DRIVER_PHONE).single();
      const { data: driver } = await admin.from("drivers").select("id").eq("profile_id", profile!.id).single();
      await login(page, PHONES.carrier);

      await page.goto("/carrier/search");
      await expect(page.locator("[data-slot=result-count]")).toBeVisible();
      await expect(page.locator("[data-slot=documented-profile]")).toHaveCount(0);

      await page.goto(`/carrier/drivers/${driver!.id}`);
      await expect(page.locator("[data-slot=documented-profile]")).toHaveText("Documented profile");
      await expect(page.locator("main")).not.toContainText("Roster-Ready");
      await expect(page.locator("main")).not.toContainText(/approved/i);
      const card = page.locator("[data-slot=driver-card]");
      await expect(card.locator("div", { hasText: /^Experience/ }).locator("[data-slot=self-reported]")).toHaveText("Self-reported");
      await expect(card.locator("div", { hasText: /^Cards/ }).locator("[data-slot=self-reported]")).toHaveText("Self-reported");
      await expectNoAccessibilityViolations(page, "carrier driver page");
    });
  });
}
