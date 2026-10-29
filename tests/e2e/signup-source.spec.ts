import { expect, test, type BrowserContext } from "@playwright/test";
import {
  addDriverCardAtStep,
  adminClient,
  adminList,
  chooseRole,
  enterCode,
  login,
  nextButton,
  OTP,
  PHONES,
  requestCode,
  resetUser,
  screenHeading,
  seedUser,
} from "./helpers";

/**
 * Sign-up source tracking (Milestone 3, part 4): a scan of a printed code tags the visit,
 * the tag waits in a first-party cookie, and the profile keeps it at sign-up together with
 * the code. The first touch wins over later links. The driver's own answer on the last
 * page is kept beside it. The admin's Drivers page shows both and narrows to one code.
 */

const COOKIE = "fg_src";

const sourceOf = async (phone: string) => {
  const { data } = await adminClient()
    .from("profiles")
    .select("signup_utm_source, signup_utm_medium, signup_utm_campaign, signup_utm_content, signup_referrer, signup_landing_path, qr_link_id")
    .eq("phone", phone)
    .single();
  return data;
};

const attributionCookie = async (context: BrowserContext) =>
  (await context.cookies()).find((cookie) => cookie.name === COOKIE);

test.describe("sign-up source", () => {
  const slug = `source-e2e-${Date.now()}`;
  const location = `Pilot, I-10 e2e ${Date.now()}`;
  let qrLinkId = "";

  test.beforeAll(async () => {
    const adminId = await seedUser(PHONES.admin, "admin", "approved");
    const { data, error } = await adminClient()
      .from("qr_links")
      .insert({ slug, location_name: location, campaign: "pasadena-225", target_path: "/drivers", created_by: adminId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    qrLinkId = data.id;
  });

  test.afterAll(async () => {
    await resetUser(PHONES.driver);
    await resetUser(PHONES.secondDriver);
    await adminClient().from("qr_links").delete().eq("id", qrLinkId);
  });

  test("a scanned code follows the driver to their profile, the question is optional, and the admin sees both", async ({
    page,
    context,
  }) => {
    await resetUser(PHONES.driver);

    // The scan: the short link tags the landing page and the cookie keeps the tags.
    await page.goto(`/q/${slug}`);
    await expect(page).toHaveURL(new RegExp(`/drivers\\?utm_source=flyer&utm_medium=qr&utm_campaign=pasadena-225&utm_content=${slug}$`));
    const cookie = await attributionCookie(context);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    // The value is URL-encoded JSON, and the cookie header encodes it once more.
    expect(decodeURIComponent(decodeURIComponent(cookie!.value))).toContain(`"t":"${slug}"`);

    // Later pages do not overwrite the first touch.
    await page.goto("/faq?utm_source=second");
    expect((await attributionCookie(context))!.value).toBe(cookie!.value);

    // Sign up: the tags move to the profile with the code, and the cookie goes.
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/choose-role/);
    await chooseRole(page, "driver");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/driver\/onboarding$/);
    expect(await sourceOf(PHONES.driver)).toEqual({
      signup_utm_source: "flyer",
      signup_utm_medium: "qr",
      signup_utm_campaign: "pasadena-225",
      signup_utm_content: slug,
      signup_referrer: null,
      signup_landing_path: "/drivers",
      qr_link_id: qrLinkId,
    });
    expect(await attributionCookie(context)).toBeUndefined();

    // The last page asks the question; a tap is enough, and Other has a short line.
    const driverId = await addDriverCardAtStep(PHONES.driver, 10);
    await page.goto("/driver/onboarding");
    await expect(screenHeading(page)).toHaveText("Finish");
    const question = page.getByRole("group", { name: "How did you hear about FleetGrid?" });
    await expect(page.getByText("Optional. It tells us where to put the next flyers.")).toBeVisible();
    await expect(page.getByLabel("Where was that?")).toHaveCount(0);
    await question.getByRole("button", { name: "Other" }).click();
    await page.getByLabel("Where was that?").fill("Radio ad");
    await nextButton(page, "Find local shifts").click();
    await expect(screenHeading(page)).toHaveText("You're in!");
    const { data: card } = await adminClient()
      .from("drivers")
      .select("heard_from, heard_from_other, card_completed, onboarding_step")
      .eq("id", driverId)
      .single();
    expect(card).toEqual({ heard_from: "other", heard_from_other: "Radio ad", card_completed: true, onboarding_step: 12 });

    // The admin: the list names the code, narrows to it from the Analytics sheet, and the detail shows what the driver said.
    await page.context().clearCookies();
    await login(page, PHONES.admin);
    await page.goto(`/admin/analytics?open=${qrLinkId}`);
    await page.getByRole("dialog", { name: location }).getByRole("link", { name: "See the drivers who scanned it" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/drivers\\?qr=${qrLinkId}$`));
    await expect(page.getByRole("link", { name: new RegExp(`^QR code: ${location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })).toBeVisible();
    const table = adminList(page, "Drivers");
    await expect(table.getByRole("link", { name: /^Pat Driver/ })).toHaveCount(1);
    await expect(table).toContainText(`QR: ${location}`);
    await table.getByRole("link", { name: /^Pat Driver/ }).click();
    const sheet = page.getByRole("dialog", { name: "Pat Driver" });
    const source = sheet.locator("[data-slot=source]");
    await expect(source).toContainText(`QR: ${location}`);
    await expect(source).toContainText("pasadena-225");
    await expect(source).toContainText(`flyer / qr / ${slug}`);
    await expect(source).toContainText("/drivers");
    await expect(source).toContainText("Other: Radio ad");
  });

  test("a plain visit signs up as direct, and the question can be skipped", async ({ page }) => {
    await resetUser(PHONES.secondDriver);
    await page.goto("/");
    await requestCode(page, PHONES.secondDriver);
    await enterCode(page, OTP);
    await expect(page).toHaveURL(/\/choose-role/);
    await chooseRole(page, "driver");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/driver\/onboarding$/);
    expect(await sourceOf(PHONES.secondDriver)).toEqual({
      signup_utm_source: null,
      signup_utm_medium: null,
      signup_utm_campaign: null,
      signup_utm_content: null,
      signup_referrer: null,
      signup_landing_path: "/",
      qr_link_id: null,
    });

    const driverId = await addDriverCardAtStep(PHONES.secondDriver, 10, { full_name: "Sam Second" });
    await page.goto("/driver/onboarding");
    await nextButton(page, "Find local shifts").click();
    await expect(screenHeading(page)).toHaveText("You're in!");
    const { data: card } = await adminClient()
      .from("drivers")
      .select("heard_from, heard_from_other, card_completed")
      .eq("id", driverId)
      .single();
    expect(card).toEqual({ heard_from: null, heard_from_other: null, card_completed: true });

    await page.context().clearCookies();
    await login(page, PHONES.admin);
    await page.goto("/admin/drivers?source=direct");
    await expect(page.getByRole("link", { name: /^Source: Direct or unknown/ })).toBeVisible();
    await expect(adminList(page, "Drivers").getByRole("link", { name: /^Sam Second/ })).toHaveCount(1);
    await page.goto("/admin/drivers?source=qr");
    await expect(adminList(page, "Drivers").getByRole("link", { name: /^Sam Second/ })).toHaveCount(0);
  });
});
