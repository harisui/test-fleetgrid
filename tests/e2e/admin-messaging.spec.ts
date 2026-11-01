import AxeBuilder from "@axe-core/playwright";
import { formatInTimeZone } from "date-fns-tz";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, COMPLETE_STEP, login, PHONES, resetUser, seedCarrier, seedDriverAtStep, seedUser } from "./helpers";

/**
 * Admin Messaging: Activity (Milestone 3 part 6) and Send notice (CR-3). Activity lists what
 * went out and came back, masks phones in lists, and resends a failed text once. Send notice
 * has no text box: the admin picks, previews, types SEND {N}, and the texts go through the
 * one sending path to eligible drivers only.
 */

const APPROVED =
  "FleetGrid: Your profile is approved. You'll get texts when matching shifts open. Reply STOP to opt out.";

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

const quietNow = () => {
  const hour = Number(formatInTimeZone(new Date(), "America/Chicago", "H"));
  return hour >= 21 || hour < 7;
};

test.describe("admin messaging: activity", () => {
  let driverId: string;
  let failedId: string;
  let stoppedId: string;

  test.beforeEach(async () => {
    await seedUser(PHONES.admin, "admin", "approved");
    await resetUser(PHONES.driver);
    await resetUser(PHONES.carrier);
    const admin = adminClient();
    await admin.from("sms_messages").delete().or(`to_phone.eq.${PHONES.driver},from_phone.eq.${PHONES.driver},from_phone.eq.+15555559999`);
    const seeded = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { full_name: "Ana Activity" });
    driverId = seeded.driverId!;
    await admin.from("profiles").update({ status: "approved" }).eq("id", seeded.userId);
    const { carrierId } = await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
    const start = new Date(Date.now() + 30 * 3_600_000);
    const { data: shift } = await admin
      .from("shifts")
      .insert({
        carrier_id: carrierId,
        short_code: "",
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + 8 * 3_600_000).toISOString(),
        zip: "77002",
        city: "Houston",
        state: "TX",
        lat: 29.7594,
        lng: -95.3594,
        work_description: "Yard moves for the messaging spec.",
        onsite_contact_name: "Lee Yard",
        onsite_contact_phone: "+17135550142",
      })
      .select("id, short_code")
      .single();
    await admin.from("shifts").update({ broadcast_round: 1, broadcast_at: new Date().toISOString() }).eq("id", shift!.id);
    await admin.from("broadcast_recipients").insert({ shift_id: shift!.id, driver_id: driverId, round: 1, position: 1, code: shift!.short_code, status: "delivered" });
    const { data: texts } = await admin
      .from("sms_messages")
      .insert([
        { direction: "outbound", kind: "approved", from_phone: "fake", to_phone: PHONES.driver, body: APPROVED, status: "failed", error_code: "30003", driver_id: driverId },
        { direction: "outbound", kind: "approved", from_phone: "fake", to_phone: PHONES.driver, body: APPROVED, status: "failed", error_code: "21610", driver_id: driverId },
        { direction: "inbound", kind: "inbound", from_phone: PHONES.driver, to_phone: "fake", body: `YES ${shift!.short_code}`, status: "received", driver_id: driverId, shift_id: shift!.id, inbound_outcome: "booked" },
        { direction: "inbound", kind: "inbound", from_phone: "+15555559999", to_phone: "fake", body: "who is this", status: "received", inbound_outcome: "unknown_sender" },
      ])
      .select("id");
    failedId = texts![0].id;
    stoppedId = texts![1].id;
  });

  test.afterAll(async () => {
    await resetUser(PHONES.driver);
    await resetUser(PHONES.carrier);
  });

  test("tiles, the four tabs, masked phones in lists and whole in the sheet, and a resend once", async ({ page }) => {
    await login(page, PHONES.admin);
    await page.goto("/admin/messaging");
    await expect(page.getByRole("heading", { level: 1, name: "Messaging" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Shift broadcasts" }).locator("[data-slot=broadcast-row]").filter({ hasText: "Bayou Freight LLC" }).first()).toContainText("1 YES replies");

    await page.goto("/admin/messaging?tab=unmatched");
    const unmatched = page.getByRole("list", { name: "Unmatched inbound" });
    await expect(unmatched).toContainText("(***) ***-9999");
    await expect(unmatched).not.toContainText("(555) 555-9999");

    await page.goto(`/admin/messaging?tab=account&type=approved&driver=${driverId}`);
    const list = page.getByRole("list", { name: "Account texts", exact: true });
    await expect(list.locator("[data-slot=message-row]")).toHaveCount(2);
    await expect(list).not.toContainText("(555) 555-0110");

    await page.goto(`/admin/messaging?tab=account&type=approved&message=${stoppedId}`);
    const stopped = page.getByRole("dialog");
    await expect(stopped.locator("[data-slot=full-phone]")).toHaveText("(555) 555-0110");
    await expect(stopped.getByRole("button", { name: "Resend" })).toBeDisabled();
    await expect(stopped.locator("[data-slot=resend-reason]")).toContainText("21610");

    await page.goto(`/admin/messaging?tab=account&type=approved&message=${failedId}`);
    const sheet = page.getByRole("dialog");
    if (quietNow()) {
      await expect(sheet.locator("[data-slot=resend-reason]")).toContainText("7:00 AM");
      return;
    }
    await sheet.getByRole("button", { name: "Resend" }).click();
    await page.getByRole("dialog", { name: "Resend this text?" }).getByRole("button", { name: "Resend" }).click();
    await expect.poll(async () => {
      const { data } = await adminClient().from("sms_messages").select("id").eq("resend_of", failedId);
      return data?.length;
    }).toBe(1);
    await page.goto(`/admin/messaging?tab=account&type=approved&message=${failedId}`);
    await expect(page.getByRole("dialog").locator("[data-slot=resend-reason]")).toContainText("already resent once");
    const { data: audit } = await adminClient().from("admin_audit_log").select("action").eq("target_id", failedId);
    expect(audit).toEqual([{ action: "message_resent" }]);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`Activity passes axe (${colorScheme})`, async ({ page }) => {
      await page.context().addCookies([{ name: "fleetgrid-theme", value: colorScheme, url: "http://localhost:3000" }]);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await login(page, PHONES.admin);
      for (const tab of ["broadcasts", "account", "notices", "unmatched"]) {
        await page.goto(`/admin/messaging?tab=${tab}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoAccessibilityViolations(page, `${tab} ${colorScheme}`);
      }
    });
  }
});

test.describe("admin messaging: send notice", () => {
  let driverId: string;

  test.beforeEach(async () => {
    await seedUser(PHONES.admin, "admin", "approved");
    await resetUser(PHONES.driver);
    // The notice limits count batches, so each run starts from none (local test data only).
    await adminClient().from("notice_batches").delete().neq("id", "00000000-0000-4000-8000-000000000000");
    const seeded = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { full_name: "Nia Notice" });
    driverId = seeded.driverId!;
    await adminClient().from("profiles").update({ status: "approved" }).eq("id", seeded.userId);
  });

  test.afterAll(async () => {
    await resetUser(PHONES.driver);
  });

  test("a bulk service notice: fixed words, the count and exclusions, the SEND {N} gate", async ({ page }) => {
    await login(page, PHONES.admin);
    await page.goto("/admin/messaging/send");
    await expect(page.getByRole("heading", { level: 1, name: "Send notice" })).toBeVisible();
    await expect(page.locator("textarea")).toHaveCount(0);
    await page.getByRole("radio", { name: /Service notice/ }).check();
    const preview = page.locator("[data-slot=notice-preview]");
    await expect(preview.locator("[data-slot=notice-body]")).toHaveText(
      "FleetGrid: Shift texts are delayed until about 3:00 PM. We'll text you when it's fixed. Reply STOP to opt out.",
    );
    await expect(preview.locator("[data-slot=notice-meta]")).toContainText("1 segment");
    const recipients = await preview.locator("[data-slot=notice-recipients]").textContent();
    const count = Number(/^(\d+) drivers will receive this/.exec(recipients ?? "")?.[1]);
    expect(count).toBeGreaterThan(0);
    expect(recipients).toMatch(/Left out: \d+ opted out, \d+ without consent, \d+ blocked\./);

    const gate = page.getByLabel(`Type SEND ${count} to send`);
    const button = page.getByRole("button", { name: /Send notice|Queue for 7:00 AM/ });
    await gate.fill(`SEND ${count + 1}`);
    await expect(button).toBeDisabled();
    await gate.fill(`SEND ${count}`);
    await expect(button).toBeEnabled();
    await button.click();
    await page.waitForURL(/\/admin\/messaging\?tab=notices&batch=/);
    const batchId = new URL(page.url()).searchParams.get("batch")!;
    const { data: batch } = await adminClient().from("notice_batches").select("category, recipient_count, status, body").eq("id", batchId).single();
    expect(batch).toMatchObject({ category: "service_notice", recipient_count: count });
    if (batch!.status === "sent") {
      const { data: texts } = await adminClient().from("sms_messages").select("to_phone").eq("notice_batch_id", batchId);
      expect(texts).toHaveLength(count);
      expect(texts!.map((t) => t.to_phone)).toContain(PHONES.driver);
    }
    const { data: audit } = await adminClient().from("admin_audit_log").select("action").eq("target_id", batchId);
    expect(audit?.[0]?.action).toMatch(/notice_(sent|queued)/);
  });

  test("the security notice from the driver sheet goes to that one driver after a dialog", async ({ page }) => {
    await login(page, PHONES.admin);
    await page.goto(`/admin/drivers?open=${driverId}`);
    await page.getByRole("dialog", { name: "Nia Notice" }).getByRole("link", { name: "Send security notice" }).click();
    await page.waitForURL(/\/admin\/messaging\/send\?driver=/);
    await expect(page.locator("[data-slot=security-driver]")).toContainText("Nia Notice");
    await expect(page.locator("[data-slot=notice-recipients]")).toHaveText("1 driver will receive this: Nia Notice.");
    await page.getByRole("checkbox", { name: /Send now anyway/ }).check();
    await page.getByRole("button", { name: "Send security notice" }).click();
    await page.getByRole("dialog", { name: "Send the security notice to Nia Notice?" }).getByRole("button", { name: "Send" }).click();
    await page.waitForURL(/tab=notices/);
    const { data: texts } = await adminClient().from("sms_messages").select("to_phone, kind, body").eq("driver_id", driverId).eq("kind", "security");
    expect(texts).toEqual([
      {
        to_phone: PHONES.driver,
        kind: "security",
        body: "FleetGrid: We noticed unusual activity on your account. Please log in at fleetgridus.com/driver or reply HELP.",
      },
    ]);
  });

  test("drivers and carriers get a 403 on both messaging pages", async ({ page }) => {
    await login(page, PHONES.driver);
    for (const path of ["/admin/messaging", "/admin/messaging/send"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(403);
    }
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`Send notice passes axe (${colorScheme})`, async ({ page }) => {
      await page.context().addCookies([{ name: "fleetgrid-theme", value: colorScheme, url: "http://localhost:3000" }]);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await login(page, PHONES.admin);
      await page.goto("/admin/messaging/send");
      await page.getByRole("radio", { name: /Policy change/ }).check();
      await expect(page.locator("[data-slot=notice-body]")).toBeVisible();
      await expectNoAccessibilityViolations(page, `send ${colorScheme}`);
    });
  }
});
