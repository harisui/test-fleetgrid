import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { adminClient, adminList, COMPLETE_STEP, login, makeShiftReady, PHONES, resetUser, seedCarrier, seedDriverAtStep, seedUser } from "./helpers";

/**
 * The rest of the admin panel (T3.11): carriers with block and their sheet, subscriptions
 * with MRR, every shift with its text log, service areas with the head count before saving
 * and the audit log, and a driver's pause.
 */

const AREA_NAME = "E2E Dallas test area";

test.describe("admin operations", () => {
  let carrierId: string;
  let driverId: string;

  test.beforeEach(async () => {
    await seedUser(PHONES.admin, "admin", "approved");
    await resetUser(PHONES.carrier);
    await resetUser(PHONES.driver);
    await adminClient().from("service_areas").delete().eq("name", AREA_NAME);
    ({ carrierId } = await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" }));
    const seeded = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { full_name: "Pat Paused" });
    driverId = seeded.driverId!;
    await makeShiftReady(seeded.userId);
  });

  test.afterAll(async () => {
    await adminClient().from("service_areas").delete().eq("name", AREA_NAME);
    await resetUser(PHONES.carrier);
    await resetUser(PHONES.driver);
  });

  test("carriers, subscriptions and the carrier sheet with Block", async ({ page }) => {
    await login(page, PHONES.admin);
    await page.goto("/admin/carriers?status=subscribed");
    await expect(page.getByRole("heading", { level: 1, name: "Carriers" })).toBeVisible();
    await page.goto(`/admin/carriers?open=${carrierId}`);
    const sheet = page.getByRole("dialog", { name: "Bayou Freight LLC" });
    await expect(sheet).toContainText("Billing email");
    await expect(sheet).toContainText("Active");
    await sheet.getByRole("button", { name: "Block" }).click();
    await page.getByRole("alertdialog").or(page.getByRole("dialog", { name: /Block Bayou Freight LLC/ })).getByRole("button", { name: "Block" }).click();
    await expect.poll(async () => {
      const { data } = await adminClient().from("carriers").select("profile_id").eq("id", carrierId).single();
      const { data: profile } = await adminClient().from("profiles").select("status").eq("id", data!.profile_id).single();
      return profile?.status;
    }).toBe("blocked");
    const { data: audit } = await adminClient()
      .from("admin_audit_log")
      .select("action")
      .eq("target_id", carrierId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(audit?.[0]?.action).toBe("carrier_blocked");

    await page.goto("/admin/subscriptions");
    await expect(page.locator("[data-slot=stat-tile]").filter({ hasText: "MRR" })).toContainText("$");
    await expect(page.locator("[data-slot=subscription-row]").filter({ hasText: "Bayou Freight LLC" }).first()).toBeVisible();
  });

  test("service areas: the head count before saving, add, deactivate, all in the audit log", async ({ page }) => {
    await login(page, PHONES.admin);
    await page.goto("/admin/service-areas");
    const form = page.locator("[data-slot=area-form]").first();
    await form.getByLabel(/^Name/).fill(AREA_NAME);
    await form.getByLabel(/^Centre ZIP/).fill("75201");
    await form.getByLabel(/^Radius in miles/).fill("30");
    await expect(form.locator("[data-slot=area-preview]")).toContainText(/Centre Dallas TX\. \d+ drivers and \d+ carriers inside this area\./);
    await form.getByRole("button", { name: "Add area" }).click();
    const row = page.locator("[data-slot=area-row]").filter({ hasText: AREA_NAME });
    await expect(row).toContainText("Centre 75201, 30 miles.");
    await row.getByRole("button", { name: "Deactivate" }).click();
    await page.getByRole("dialog", { name: `Deactivate ${AREA_NAME}?` }).getByRole("button", { name: "Deactivate" }).click();
    await expect(row).toContainText("Off");
    const { data: area } = await adminClient().from("service_areas").select("id, is_active, center_lat").eq("name", AREA_NAME).single();
    expect(area).toMatchObject({ is_active: false });
    expect(Number(area!.center_lat)).toBeCloseTo(32.79, 1);
    const { data: audit } = await adminClient()
      .from("admin_audit_log")
      .select("action, admin_phone")
      .eq("target_id", area!.id)
      .order("created_at", { ascending: true });
    expect(audit).toEqual([
      { action: "service_area_created", admin_phone: PHONES.admin },
      { action: "service_area_deactivated", admin_phone: PHONES.admin },
    ]);
  });

  test("a driver's shift texts are paused from the sheet", async ({ page }) => {
    await login(page, PHONES.admin);
    await page.goto(`/admin/drivers?open=${driverId}`);
    const sheet = page.getByRole("dialog", { name: "Pat Paused" });
    await expect(sheet.locator("[data-slot=no-shows]")).toContainText("0 no-shows.");
    await sheet.getByRole("button", { name: "Pause shift texts" }).click();
    await page.getByRole("dialog", { name: "Pause shift texts for Pat Paused?" }).getByRole("button", { name: "Pause" }).click();
    await expect.poll(async () => {
      const { data } = await adminClient().from("drivers").select("shifts_paused").eq("id", driverId).single();
      return data?.shifts_paused;
    }).toBe(true);
    await expect(sheet.getByRole("button", { name: "Resume shift texts" })).toBeVisible();

    // Resuming needs a reason, and it goes in the audit log.
    await sheet.getByRole("button", { name: "Resume shift texts" }).click();
    const resume = page.getByRole("dialog", { name: "Resume shift texts for Pat Paused?" });
    const confirm = resume.getByRole("button", { name: "Resume" });
    await expect(confirm).toBeDisabled();
    await resume.getByLabel(/Why may they get shift texts again/).fill("Called them, a family emergency");
    await confirm.click();
    await expect.poll(async () => {
      const { data } = await adminClient().from("drivers").select("shifts_paused").eq("id", driverId).single();
      return data?.shifts_paused;
    }).toBe(false);
    const { data: audit } = await adminClient().from("admin_audit_log").select("detail").eq("target_id", driverId).eq("action", "driver_unpaused").single();
    expect(audit?.detail).toMatchObject({ reason: "Called them, a family emergency" });
  });

  test("Paused: no-shows and Booked, not notified show in the admin, with no accessibility issue", async ({ page }) => {
    await adminClient().from("drivers").update({ shifts_paused: true, shifts_paused_reason: "no_shows" }).eq("id", driverId);
    const start = new Date(Date.now() + 26 * 3_600_000);
    const { error } = await adminClient().from("shifts").insert({
      carrier_id: carrierId,
      short_code: "",
      status: "booked",
      booked_driver_id: driverId,
      booked_at: new Date().toISOString(),
      booked_notice_failed_at: new Date().toISOString(),
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 8 * 3_600_000).toISOString(),
      zip: "77002",
      city: "Houston",
      state: "TX",
      lat: 29.7594,
      lng: -95.3594,
      work_description: "Yard moves for the admin spec.",
      onsite_contact_name: "Lee Yard",
      onsite_contact_phone: "+17135550142",
    });
    if (error) throw error;

    await login(page, PHONES.admin);
    await page.goto("/admin/drivers?q=Pat+Paused");
    await expect(adminList(page, "Drivers")).toContainText("Paused: no-shows");
    await page.goto("/admin/shifts?status=booked");
    await expect(page.locator("[data-slot=booked-not-notified]").first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("nextjs-portal").analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
    await page.goto("/admin/messaging");
    await expect(page.locator("[data-slot=booked-not-notified-note]")).toContainText("Booked, not notified: 1");
  });

  test("shifts: a posted shift with its text log, numbers only in the sheet", async ({ page }) => {
    const start = new Date(Date.now() + 26 * 3_600_000);
    const { data: shift, error } = await adminClient()
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
        work_description: "Yard moves for the admin spec.",
        onsite_contact_name: "Lee Yard",
        onsite_contact_phone: "+17135550142",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await adminClient().from("sms_messages").insert({
      direction: "inbound",
      kind: "inbound",
      from_phone: PHONES.driver,
      to_phone: "fake",
      body: "YES 1234",
      shift_id: shift.id,
      provider_sid: `SMadmin${shift.id.slice(0, 8)}`,
    });
    await login(page, PHONES.admin);
    await page.goto("/admin/shifts");
    const listRow = page.locator("[data-slot=admin-shift-row]").filter({ hasText: "Bayou Freight LLC" }).first();
    await expect(listRow).toBeVisible();
    await expect(page.getByRole("list", { name: "Shifts" })).not.toContainText("(555) 555-0110");
    await page.goto(`/admin/shifts?open=${shift.id}`);
    const sheet = page.getByRole("dialog", { name: "Bayou Freight LLC, CDL-A" });
    await expect(sheet.getByRole("list", { name: "Text log" })).toContainText("YES 1234");
    await expect(sheet.getByRole("list", { name: "Text log" })).toContainText("(555) 555-0110");
  });
});
