import AxeBuilder from "@axe-core/playwright";
import { formatInTimeZone } from "date-fns-tz";
import { expect, test, type Page } from "@playwright/test";
import { bookedText, cancelledText, FILLED_TEXT, offerText } from "@/lib/shifts/texts";
import {
  adminClient,
  COMPLETE_STEP,
  login,
  PHONES,
  resetUser,
  seedCarrier,
  seedDriverAtStep,
  makeShiftReady,
} from "./helpers";

/**
 * Broadcast Shift end to end with the fake text sender (SMS_TEST_MODE): a carrier posts a
 * shift, the matching drivers are texted the approved alert, a YES books it and only the
 * winner gets the booked text, a late YES gets the filled text, the carrier sees the
 * winner's name and phone on that shift, the driver sees the shift and its on-site contact on
 * My shifts, a release counts the no-show and sends the shift out again without them, a
 * cancel texts the booked driver, and STOP and START are synced without a reply.
 */

const TZ = "America/Chicago";
/** The ZIP centre of Pasadena, TX, from src/data/us-zips.tsv: inside the launch areas. */
const PASADENA = { city: "Pasadena", state: "TX", zip: "77506", lat: 29.7009, lng: -95.1989 } as const;
const ONSITE = { name: "Lee Yard", phone: "+17135550142", display: "(713) 555-0142" };

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

/** A complete, approved driver with shift texts on, in Pasadena. */
async function seedListedDriver(phone: string, name: string): Promise<string> {
  const { userId, driverId } = await seedDriverAtStep(phone, COMPLETE_STEP, {
    full_name: name,
    ...PASADENA,
  });
  await makeShiftReady(userId);
  return driverId!;
}

/** The texts the fake sender logged to a number, oldest first. */
async function textsTo(phone: string, kind?: string): Promise<string[]> {
  let query = adminClient().from("sms_messages").select("body, kind").eq("direction", "outbound").eq("to_phone", phone);
  if (kind) query = query.eq("kind", kind);
  const { data } = await query.order("created_at", { ascending: true });
  return (data ?? []).map((row) => row.body);
}

/** Replies as a texted driver through the shift page's test-mode control. */
async function reply(page: Page, driverId: string, shiftId: string, body: string) {
  const { data } = await adminClient()
    .from("broadcast_recipients")
    .select("position, round")
    .eq("shift_id", shiftId)
    .eq("driver_id", driverId)
    .order("round", { ascending: false })
    .limit(1)
    .single();
  const control = page.locator("[data-slot=simulate-reply]");
  await control.getByRole("combobox", { name: "Driver" }).click();
  await page.getByRole("option", { name: `Driver ${data!.position}`, exact: true }).click();
  await control.getByLabel("Reply").fill(body);
  await control.getByRole("button", { name: "Send reply" }).click();
  await expect(control.getByRole("button", { name: "Send reply" })).toBeEnabled();
}

async function shiftRow(shiftId: string) {
  const { data } = await adminClient().from("shifts").select("*").eq("id", shiftId).single();
  return data!;
}

test.describe("Broadcast Shift", () => {
  let first: string;
  let second: string;

  test.beforeEach(async () => {
    for (const phone of [PHONES.carrier, PHONES.driver, PHONES.secondDriver]) await resetUser(phone);
    // The text log outlives accounts (it is kept by number), so this spec clears its own numbers.
    const numbers = [PHONES.driver, PHONES.secondDriver].join(",");
    await adminClient().from("sms_messages").delete().or(`to_phone.in.(${numbers}),from_phone.in.(${numbers})`);
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
    first = await seedListedDriver(PHONES.driver, "Pat Winner");
    second = await seedListedDriver(PHONES.secondDriver, "Sam Second");
  });

  test.afterAll(async () => {
    for (const phone of [PHONES.carrier, PHONES.driver, PHONES.secondDriver]) await resetUser(phone);
  });

  test("post, book, filled, release, rebook, cancel, STOP and START", async ({ page, browser }) => {
    test.setTimeout(120_000);
    await login(page, PHONES.carrier);
    await page.goto("/carrier/shifts");
    await expect(page.getByRole("heading", { level: 1, name: "Shifts" })).toBeVisible();
    await expect(page.getByText("No shifts yet")).toBeVisible();
    await page.getByRole("link", { name: "Post a shift" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Post a shift" })).toBeVisible();

    // A shift three hours from now, so it goes at once whatever the hour (quiet hours have
    // their own checks): Houston date and time, as a carrier types them.
    const start = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await page.getByLabel(/^ZIP code/).fill("77506");
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Pasadena");
    await page.getByLabel(/^Date/).fill(formatInTimeZone(start, TZ, "yyyy-MM-dd"));
    await page.getByLabel(/^Start time/).fill(formatInTimeZone(start, TZ, "HH:mm"));
    await page.getByLabel(/^End time/).fill(formatInTimeZone(new Date(start.getTime() + 8 * 3_600_000), TZ, "HH:mm"));
    await page.getByLabel(/^What the driver will do/).fill("Container moves between Barbours Cut and our yard.");
    await page.getByLabel(/^Pay/).fill("$32 an hour");
    await page.getByLabel(/^On-site contact/).fill(ONSITE.name);
    await page.getByLabel(/^On-site phone/).fill(ONSITE.display);
    await expect(page.locator("[data-slot=match-count]")).toContainText(/\d+ drivers? match/);
    await expect(page.locator("[data-slot=quiet-hours-help]")).toHaveText(
      "Shifts posted between 9 PM and 7 AM go out at 7:00 AM, unless the shift starts within 12 hours.",
    );
    await expectNoAccessibilityViolations(page, "post a shift");
    await page.getByRole("button", { name: "Post shift" }).click();

    await page.waitForURL(/\/carrier\/shifts\/[0-9a-f-]{36}$/);
    const shiftId = page.url().split("/").pop()!;
    await expect(page.locator("[data-status=open]").first()).toBeVisible();
    const posted = await shiftRow(shiftId);
    expect(posted).toMatchObject({ status: "open", broadcast_round: 1, onsite_contact_phone: ONSITE.phone, city: "Pasadena" });
    await expect(page.locator("[data-slot=shift-code]")).toContainText(posted.short_code);

    // Both drivers were texted the approved alert with the shift's code.
    const alert = offerText({ cdlClass: "A", city: "Pasadena", state: "TX", startsAt: posted.starts_at }, posted.short_code);
    expect(await textsTo(PHONES.driver, "offer")).toEqual([alert]);
    expect(await textsTo(PHONES.secondDriver, "offer")).toEqual([alert]);
    await expect(page.locator("[data-slot=recipient-counts]")).toContainText("texted");
    await expectNoAccessibilityViolations(page, "shift page, open");

    // The first YES books it; only the winner hears so.
    await reply(page, first, shiftId, `YES ${posted.short_code}`);
    await expect(page.locator("[data-slot=booked-driver]")).toContainText("Pat Winner");
    await expect(page.locator("[data-slot=booked-driver]")).toContainText("(555) 555-0110");
    const booked = bookedText({ cdlClass: "A", city: "Pasadena", state: "TX", startsAt: posted.starts_at });
    expect(await textsTo(PHONES.driver, "booked")).toEqual([booked]);
    expect(await textsTo(PHONES.secondDriver, "booked")).toEqual([]);
    expect(await textsTo(PHONES.secondDriver, "filled")).toEqual([]);

    // A late YES gets the filled text; nobody else does.
    await reply(page, second, shiftId, `yes ${posted.short_code}`);
    expect(await textsTo(PHONES.secondDriver, "filled")).toEqual([FILLED_TEXT]);
    expect(await textsTo(PHONES.driver, "filled")).toEqual([]);
    await expectNoAccessibilityViolations(page, "shift page, booked");

    // The driver sees the shift, the work, the pay and the on-site contact on My shifts.
    const driverContext = await browser.newContext({ ...test.info().project.use });
    const driverPage = await driverContext.newPage();
    await login(driverPage, PHONES.driver);
    await driverPage.goto("/driver");
    const card = driverPage.locator("[data-slot=my-shift]");
    await expect(card).toContainText("Barbours Cut");
    await expect(card).toContainText("$32 an hour");
    await expect(card).toContainText(`Ask for ${ONSITE.name}`);
    await expect(card.getByRole("link", { name: ONSITE.display })).toHaveAttribute("href", `tel:${ONSITE.phone}`);
    await expectNoAccessibilityViolations(driverPage, "my shifts");
    await driverContext.close();

    // The winner does not show: release counts it and sends the shift out again without them.
    await page.getByRole("button", { name: "Release and rebroadcast" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Release and rebroadcast" }).click();
    await expect(page.locator("[data-slot=booked-driver]")).toHaveCount(0);
    const released = await shiftRow(shiftId);
    expect(released).toMatchObject({ status: "open", broadcast_round: 2, booked_driver_id: null });
    expect(released.short_code).not.toBe(posted.short_code);
    const { data: noShow } = await adminClient().from("drivers").select("no_show_count").eq("id", first).single();
    expect(noShow?.no_show_count).toBe(1);
    const { data: round2 } = await adminClient()
      .from("broadcast_recipients")
      .select("driver_id")
      .eq("shift_id", shiftId)
      .eq("round", 2);
    expect(round2!.map((r) => r.driver_id)).toContain(second);
    expect(round2!.map((r) => r.driver_id)).not.toContain(first);

    // The second driver books the new code; the carrier cancels; the driver is told.
    await reply(page, second, shiftId, `YES ${released.short_code}`);
    await expect(page.locator("[data-slot=booked-driver]")).toContainText("Sam Second");
    await page.getByRole("button", { name: "Cancel shift" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel shift" }).click();
    await expect(page.locator("[data-status=cancelled]").first()).toBeVisible();
    expect(await textsTo(PHONES.secondDriver, "cancelled")).toEqual([
      cancelledText({ cdlClass: "A", city: "Pasadena", state: "TX", startsAt: posted.starts_at }),
    ]);

    // STOP and START: synced and logged, never answered by FleetGrid (Twilio answers them).
    const before = (await textsTo(PHONES.secondDriver)).length;
    await reply(page, second, shiftId, "STOP");
    let { data: driver } = await adminClient().from("drivers").select("sms_opted_out").eq("id", second).single();
    expect(driver?.sms_opted_out).toBe(true);
    await reply(page, second, shiftId, "START");
    ({ data: driver } = await adminClient().from("drivers").select("sms_opted_out").eq("id", second).single());
    expect(driver?.sms_opted_out).toBe(false);
    expect((await textsTo(PHONES.secondDriver)).length).toBe(before);
    const { data: consent } = await adminClient()
      .from("sms_consent_log")
      .select("event, source")
      .eq("phone", PHONES.secondDriver)
      .in("source", ["sms_stop", "sms_start"])
      .order("created_at", { ascending: true });
    expect(consent?.slice(-2)).toEqual([
      { event: "opt_out", source: "sms_stop" },
      { event: "opt_in_again", source: "sms_start" },
    ]);

    // The list shows the shift as cancelled.
    await page.goto("/carrier/shifts");
    await expect(page.locator("[data-slot=shift-row] [data-status=cancelled]")).toBeVisible();
  });

  test("the booked driver's phone appears on that shift only, never in search or a driver page", async ({ page }) => {
    await login(page, PHONES.carrier);
    await page.goto("/carrier/search");
    await expect(page.getByText("(555) 555-0110")).toHaveCount(0);
    await page.goto(`/carrier/drivers/${first}`);
    await expect(page.getByText("(555) 555-0110")).toHaveCount(0);
  });
});
