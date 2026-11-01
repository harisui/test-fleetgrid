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
