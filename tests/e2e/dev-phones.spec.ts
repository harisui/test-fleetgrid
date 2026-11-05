import { formatInTimeZone } from "date-fns-tz";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, login, PHONES, resetUser, seedCarrier } from "./helpers";

/**
 * The fake phone inbox, driven by hand as a person would: two fake drivers are added on the page,
 * a carrier posts a shift, both phones show the alert, both reply through the real signed webhook,
 * and each sees the answer FleetGrid sent.
 */
const TZ = "America/Chicago";

async function addFakeDriver(page: Page) {
  const before = await page.locator("[data-slot=fake-phone]").count();
  await page.getByRole("button", { name: "Add drivers" }).click();
  await expect(page.locator("[data-slot=fake-phone]")).toHaveCount(before + 1);
}

async function removeFakeDrivers() {
  const admin = adminClient();
  const { data } = await admin.from("drivers").select("profile_id").like("full_name", "Fake Driver %");
  for (const row of data ?? []) await admin.auth.admin.deleteUser(row.profile_id);
}

test.describe("fake phones", () => {
  test.beforeEach(async () => {
    await removeFakeDrivers();
    await resetUser(PHONES.carrier);
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
  });

  test.afterAll(async () => {
    await removeFakeDrivers();
    await resetUser(PHONES.carrier);
  });

  test("add phones, post a shift, reply from both: one is booked, one is told it is taken", async ({ page, browser }) => {
    test.setTimeout(120_000);
    await page.goto("/dev/phones");
    await expect(page.getByRole("heading", { level: 1, name: "Fake phones" })).toBeVisible();
    await addFakeDriver(page);
    await addFakeDriver(page);
    const links = page.locator("[data-slot=fake-phone]");
    const [firstHref, secondHref] = [await links.nth(0).getAttribute("href"), await links.nth(1).getAttribute("href")];

    const carrierContext = await browser.newContext();
    const carrier = await carrierContext.newPage();
    await login(carrier, PHONES.carrier);
    await carrier.goto("/carrier/shifts/new");
    const start = new Date(Date.now() + 3 * 3_600_000);
    await carrier.getByLabel(/^ZIP code/).fill("77506");
    await expect(carrier.locator("[data-slot=zip-place]")).toContainText("Pasadena");
    await carrier.getByLabel(/^Date/).fill(formatInTimeZone(start, TZ, "yyyy-MM-dd"));
    await carrier.getByLabel(/^Start time/).fill(formatInTimeZone(start, TZ, "HH:mm"));
    await carrier.getByLabel(/^End time/).fill(formatInTimeZone(new Date(start.getTime() + 8 * 3_600_000), TZ, "HH:mm"));
    await carrier.getByLabel(/^What the driver will do/).fill("Yard moves for the fake phone check.");
    await carrier.getByLabel(/^On-site contact/).fill("Lee Yard");
    await carrier.getByLabel(/^On-site phone/).fill("713 555 0142");
    await carrier.getByRole("button", { name: "Post shift" }).click();
    await carrier.waitForURL(/\/carrier\/shifts\/[0-9a-f-]{36}$/);
    const shiftId = carrier.url().split("/").pop()!;
    await carrierContext.close();
    const { data: shift } = await adminClient().from("shifts").select("short_code").eq("id", shiftId).single();
    const code = shift!.short_code;

    const send = async (body: string) => {
      await page.getByLabel("Reply").fill(body);
      await page.getByRole("button", { name: "Send reply" }).click();
    };
    const texts = page.locator("[data-slot=fake-text]");

    await page.goto(firstHref!);
    await expect(texts.first()).toContainText(`Reply YES ${code} to book it.`);
    await send(`YES ${code}`);
    await expect(texts.last()).toContainText("FleetGrid: Your shift is booked.");
    await expect(page.locator("[data-direction=inbound]")).toContainText(`YES ${code}`);

    await page.goto(secondHref!);
    await expect(texts.first()).toContainText(`Reply YES ${code} to book it.`);
    await send(`YES ${code}`);
    await expect(texts.last()).toHaveText("FleetGrid: This shift is already booked. We'll text you about the next matching shift. Reply STOP to opt out.");

    // STOP is Twilio's to answer: the phone shows no reply, and the page shows the new state.
    const before = await texts.count();
    await send("STOP");
    await expect(texts).toHaveCount(before + 1);
    await expect(page.locator("[data-slot=fake-phone][aria-current=page]")).toContainText("replied STOP");
    await expect(texts.last()).toHaveText("STOP");
  });
});
