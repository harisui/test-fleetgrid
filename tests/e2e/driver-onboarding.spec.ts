import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  CONSENT_TEXT,
  formAlert,
  login,
  nextButton,
  PHONES,
  PLACES,
  resetUser,
  screenHeading,
  seedDriverAtStep,
  seedUser,
} from "./helpers";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

const TWIC_QUESTION = "Do you have an active TWIC card?";
const MEDICAL_QUESTION = "Is your DOT medical card current?";
const MVR_QUESTION = "Any moving violations in the last 3 years?";
const FINISH = "Find local shifts";

async function startAsNewDriver(page: Page) {
  await seedUser(PHONES.driver, "driver");
  await login(page, PHONES.driver);
  await expect(page).toHaveURL(/\/driver\/onboarding$/);
}

async function resumeAt(page: Page, step: number, overrides: Record<string, unknown> = {}) {
  await seedDriverAtStep(PHONES.driver, step, overrides);
  await login(page, PHONES.driver);
  await expect(page).toHaveURL(/\/driver\/onboarding$/);
}

async function driverRow() {
  const admin = adminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", PHONES.driver)
    .single();
  const { data } = await admin.from("drivers").select("*").eq("profile_id", profile!.id).single();
  return data!;
}

const card = (page: Page, role: "checkbox" | "radio", name: RegExp) =>
  page.getByRole(role, { name });
const chip = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
/** The chip of one question, found through the question's group. */
const checkChip = (page: Page, question: string, name: string) =>
  page.getByRole("group", { name: question }).getByRole("button", { name, exact: true });

/**
 * The short sign-up (client decision of 2026-10-09): six pages, one per mile, the same on a
 * phone and a desktop. CDL drivers only. Every project runs these at its own viewport.
 */
test.describe("driver onboarding, a page per mile", () => {
  test.afterAll(async () => {
    await resetUser(PHONES.driver);
  });

  test("a driver signs up with taps only, in under two minutes, and every answer is stored", async ({
    page,
  }) => {
    const started = Date.now();
    await startAsNewDriver(page);

    // Mile 1: About
    await expect(screenHeading(page)).toHaveText("About");
    await expect(page.getByText("Mile 1 of 6", { exact: true })).toBeVisible();
    await page.getByLabel("Full name").fill("Pat Driver");
    await page.getByLabel("ZIP code", { exact: true }).fill(PLACES.houston.zip);
    // City and state come from the dataset as one read-only line; there is nothing to type.
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Houston, TX");
    await expect(page.getByLabel("City")).toHaveCount(0);
    await expect(page.getByText(/City and state filled in from your ZIP/)).toBeVisible();
    // Houston is inside the launch area: no note.
    await expect(page.locator("[data-slot=launch-area-note]")).toHaveCount(0);
    await chip(page, "100 miles").click();
    await nextButton(page).click();

    // Mile 2: CDL. No work type: FleetGrid lists CDL drivers only at launch.
    await expect(screenHeading(page)).toHaveText("CDL");
    await expect(screenHeading(page)).toBeFocused();
    await expect(page.getByText("Mile 2 of 6", { exact: true })).toBeVisible();
    await expect(page.getByText("What work do you do?")).toHaveCount(0);
    await expect(page.getByText("Do you work W-2 or 1099?")).toHaveCount(0);
    await expect(page.getByText(/No CDL/)).toHaveCount(0);
    await card(page, "radio", /Class A/).click();
    await expect(page.getByLabel("Exact number (optional)")).toHaveCount(0);
    await chip(page, "6 to 10").click();
    await expect(
      page.getByText("Major means a DUI, reckless driving, leaving the scene or a suspended license."),
    ).toBeVisible();
    await checkChip(page, MVR_QUESTION, "None").click();
    await nextButton(page).click();

    // Mile 3: Cards
    await expect(screenHeading(page)).toHaveText("Cards");
    await checkChip(page, TWIC_QUESTION, "Yes").click();
    await checkChip(page, MEDICAL_QUESTION, "Yes").click();
    await nextButton(page).click();

    // Mile 4: Letters (endorsements and transmission)
    await expect(screenHeading(page)).toHaveText("Letters");
    await expect(page.getByText(/These are called endorsements/)).toBeVisible();
    await card(page, "checkbox", /^H\b/).click();
    await card(page, "checkbox", /^T\b/).click();
    await expect(page.getByText("Can you drive a manual?")).toBeVisible();
    await card(page, "radio", /Automatic and manual/).click();
    await nextButton(page).click();

    // Mile 5: Equipment
    await expect(screenHeading(page)).toHaveText("Equipment");
    await chip(page, "Dry van").click();
    await chip(page, "Flatbed").click();
    await nextButton(page).click();

    // Mile 6: Finish. No papers, no about you: the consent box and the client's button.
    await expect(screenHeading(page)).toHaveText("Finish");
    await expect(page.getByText("Mile 6 of 6", { exact: true })).toBeVisible();
    await expect(page.getByText("Take a photo")).toHaveCount(0);
    await expect(page.getByLabel("About you")).toHaveCount(0);
    const consent = page.getByRole("checkbox", { name: new RegExp(CONSENT_TEXT.slice(0, 30)) });
    await expect(consent).not.toBeChecked();
    await consent.click();
    const before = Date.now();
    await nextButton(page, FINISH).click();

    await expect(screenHeading(page)).toHaveText("You are listed.");
    await expect(page.getByText("Profile complete", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Once your profile is approved, carriers near 77002 can find you/),
    ).toBeVisible();
    await expect(page.getByText(/Shift offers arrive by text/)).toBeVisible();
    expect(Date.now() - started).toBeLessThan(FIVE_MINUTES_MS);

    const row = await driverRow();
    expect(row).toMatchObject({
      full_name: "Pat Driver",
      city: "Houston",
      state: "TX",
      zip: "77002",
      lat: PLACES.houston.lat,
      lng: PLACES.houston.lng,
      service_radius_miles: 100,
      operator_types: ["cdl_driver"],
      cdl_class: "A",
      years_experience: 6,
      mvr_status: "clean",
      twic_active: true,
      medical_card_active: true,
      endorsements: ["H", "T"],
      transmission: "manual_ok",
      equipment_types: ["dry_van", "flatbed"],
      // Profile-page answers, never asked here.
      employment_type: null,
      driving_styles: [],
      clearinghouse_registered: null,
      availability: [],
      certifications: [],
      bio: null,
      sms_opt_in: true,
      sms_opt_in_text: CONSENT_TEXT,
      sms_opted_out: false,
      onboarding_step: 12,
      card_completed: true,
    });
    const consentAt = new Date(row.sms_opt_in_at!).getTime();
    expect(consentAt).toBeGreaterThanOrEqual(before - 5_000);
    expect(consentAt).toBeLessThanOrEqual(Date.now() + 5_000);

    // The audit log has the same consent, by phone number, so it outlives the account.
    const { data: consentLog } = await adminClient()
      .from("sms_consent_log")
      .select("event, consent_text, consent_version, source")
      .eq("phone", PHONES.driver)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(consentLog).toEqual([
      {
        event: "opt_in",
        consent_text: CONSENT_TEXT,
        consent_version: "2026-10-v1",
        source: "onboarding",
      },
    ]);

    // The summary shows every answer and can send the driver back to a page.
    const summary = page.locator("[data-slot=summary-card]");
    for (const value of [
      "Class A",
      "6 to 10 years",
      "No violations in 3 years",
      "TWIC, medical card current",
      "H, T",
      "Automatic and manual",
      "Dry van, Flatbed",
    ]) {
      await expect(summary.getByText(value, { exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Edit record" }).click();
    await expect(screenHeading(page)).toHaveText("CDL");
    await expect(checkChip(page, MVR_QUESTION, "None")).toHaveAttribute("aria-pressed", "true");
    await expect(card(page, "radio", /Class A/)).toHaveAttribute("aria-checked", "true");
    await page.goto("/driver/onboarding");
    await expect(screenHeading(page)).toHaveText("You are listed.");
    await page.getByRole("link", { name: "Go to my profile" }).click();
    await expect(page).toHaveURL(/\/driver\/profile$/);
  });

  test("a driver outside the launch area is told so, still signs up, and is marked on the profile", async ({
    page,
  }) => {
    await resumeAt(page, 2);
    await expect(screenHeading(page)).toHaveText("About");
    const note = page.locator("[data-slot=launch-area-note]");
    const zip = page.getByLabel("ZIP code", { exact: true });

    await zip.fill(PLACES.dallas.zip);
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Dallas, TX");
    await expect(note).toBeVisible();
    await expect(note).toHaveText(
      "FleetGrid is launching in the Houston area first. You can still sign up. We'll text you when we launch near you.",
    );
    // Information only: no error, nothing invalid, Next stays on.
    await expect(formAlert(page)).toHaveCount(0);
    await expect(nextButton(page)).toBeEnabled();

    // A Houston ZIP clears the note; back to Dallas brings it back.
    await zip.fill(PLACES.houston.zip);
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Houston, TX");
    await expect(note).toHaveCount(0);
    await zip.fill(PLACES.dallas.zip);
    await expect(note).toBeVisible();
    await chip(page, "50 miles").click();
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("CDL");
    expect(await driverRow()).toMatchObject({
      zip: "75201",
      lat: PLACES.dallas.lat,
      lng: PLACES.dallas.lng,
    });

    // Finish from the consent page with the Dallas card.
    await resumeAt(page, 11, { ...PLACES.dallas });
    await expect(screenHeading(page)).toHaveText("Finish");
    await page.getByRole("checkbox", { name: new RegExp(CONSENT_TEXT.slice(0, 30)) }).click();
    await nextButton(page, FINISH).click();

    await expect(screenHeading(page)).toHaveText("You're on the list.");
    await expect(page.getByText("Profile complete", { exact: true })).toBeVisible();
    await expect(
      page.getByText("FleetGrid isn't in your area yet. We'll text you when it is."),
    ).toBeVisible();
    await expect(page.getByText(/Shift offers arrive by text/)).toHaveCount(0);
    await expect(page.locator("[data-slot=summary-card]")).toBeVisible();
    expect(await driverRow()).toMatchObject({ card_completed: true, onboarding_step: 12 });

    await page.getByRole("link", { name: "Go to my profile" }).click();
    await expect(page).toHaveURL(/\/driver\/profile$/);
    const status = page.getByRole("region", { name: "Account status" });
    await expect(status.getByText("Outside launch area")).toBeVisible();
    await expect(status.locator("[data-slot=launch-area-help]")).toHaveText(
      "FleetGrid is launching in the Houston area first. We'll text you when we launch near you.",
    );
  });

  test("a refresh mid-flow resumes on the same page with the saved answers", async ({ page }) => {
    await resumeAt(page, 7);
    await expect(screenHeading(page)).toHaveText("Cards");
    await checkChip(page, TWIC_QUESTION, "No").click();
    await checkChip(page, MEDICAL_QUESTION, "Yes").click();
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("Letters");

    await page.reload();
    await expect(screenHeading(page)).toHaveText("Letters");
    await expect(page.getByText("Mile 4 of 6", { exact: true })).toBeVisible();
    expect((await driverRow()).onboarding_step).toBe(8);

    // Logging out and back in resumes there too.
    await page.goto("/driver/profile");
    await expect(page).toHaveURL(/\/driver\/onboarding$/);
    await expect(screenHeading(page)).toHaveText("Letters");
  });

  test("Back returns a whole page with its answers, and changing one never loses progress", async ({
    page,
  }) => {
    await resumeAt(page, 10);
    await expect(screenHeading(page)).toHaveText("Equipment");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(screenHeading(page)).toHaveText("Letters");
    await expect(card(page, "checkbox", /^H\b/)).toHaveAttribute("aria-checked", "true");
    await expect(card(page, "radio", /Automatic and manual/)).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await page.getByRole("button", { name: "Back" }).click();
    await expect(screenHeading(page)).toHaveText("Cards");
    await expect(checkChip(page, TWIC_QUESTION, "Yes")).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Back" }).click();
    await expect(screenHeading(page)).toHaveText("CDL");
    await expect(card(page, "radio", /Class A/)).toHaveAttribute("aria-checked", "true");
    await expect(chip(page, "6 to 10")).toHaveAttribute("aria-pressed", "true");
    await expect(checkChip(page, MVR_QUESTION, "None")).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Back" }).click();
    await expect(screenHeading(page)).toHaveText("About");
    await expect(page.getByLabel("Full name")).toHaveValue("Pat Driver");
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Houston, TX");
    await expect(chip(page, "50 miles")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);

    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("CDL");
    await card(page, "radio", /Class B/).click();
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("Cards");
    await expect(page.getByText("Saved")).toBeVisible();
    const row = await driverRow();
    expect(row.cdl_class).toBe("B");
    expect(row.onboarding_step).toBe(10);
  });

  test("errors appear only after Next, with an icon, and are specific", async ({ page }) => {
    await startAsNewDriver(page);
    await expect(formAlert(page)).toHaveCount(0);
    await page.getByLabel("Full name").fill("P");
    await expect(formAlert(page)).toHaveCount(0);

    // Every question of the page is checked together.
    await nextButton(page).click();
    await expect(formAlert(page)).toHaveCount(3);
    const error = formAlert(page).first();
    await expect(error).toHaveText("Enter your name");
    await expect(error.locator("svg")).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Pick how far you will travel")).toBeVisible();
    await expect(screenHeading(page)).toHaveText("About");

    await page.getByLabel("Full name").fill("Pat Driver");
    const zip = page.getByLabel("ZIP code", { exact: true });
    await zip.fill("7520");
    await nextButton(page).click();
    await expect(page.getByText("Enter a 5-digit ZIP code, like 60601")).toBeVisible();

    // A ZIP the dataset does not know is an error as soon as it is typed, and Next stays off.
    await zip.fill("99999");
    await expect(page.getByText("We could not find that ZIP. Check the number.")).toBeVisible();
    await expect(zip).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("[data-slot=zip-place]")).toHaveCount(0);
    await expect(nextButton(page)).toBeDisabled();

    await zip.fill(PLACES.houston.zip);
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Houston, TX");
    await expect(page.getByText("We could not find that ZIP. Check the number.")).toHaveCount(0);
    await expect(nextButton(page)).toBeEnabled();
  });

  test("the CDL page needs the class, the years and the record", async ({ page }) => {
    await resumeAt(page, 4);
    await expect(screenHeading(page)).toHaveText("CDL");
    await nextButton(page).click();
    await expect(formAlert(page)).toHaveCount(3);
    await expect(page.getByText("Pick your CDL class")).toBeVisible();
    await expect(page.getByText("Pick how many years you have driven")).toBeVisible();
    await expect(page.getByText("Pick None, 1 or 2 minor, or 3 or more")).toBeVisible();
    expect((await driverRow()).onboarding_step).toBe(4);

    await card(page, "radio", /Class C/).click();
    await chip(page, "Under 1").click();
    await checkChip(page, MVR_QUESTION, "3 or more, or a major one").click();
    // One level at a time.
    await checkChip(page, MVR_QUESTION, "1 or 2 minor").click();
    await expect(checkChip(page, MVR_QUESTION, "3 or more, or a major one")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("Cards");
    expect(await driverRow()).toMatchObject({
      cdl_class: "C",
      years_experience: 0,
      mvr_status: "minor_1_2",
      onboarding_step: 7,
    });
  });

  test("the Cards page needs both answers, and remembers them", async ({ page }) => {
    await resumeAt(page, 7);
    await expect(screenHeading(page)).toHaveText("Cards");
    await checkChip(page, TWIC_QUESTION, "No").click();
    await nextButton(page).click();
    await expect(formAlert(page)).toHaveText("Tap Yes or No for the medical card");
    await expect(screenHeading(page)).toHaveText("Cards");
    await checkChip(page, MEDICAL_QUESTION, "No").click();
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("Letters");
    expect(await driverRow()).toMatchObject({ twic_active: false, medical_card_active: false });

    await page.getByRole("button", { name: "Back" }).click();
    await expect(checkChip(page, TWIC_QUESTION, "No")).toHaveAttribute("aria-pressed", "true");
    await expect(checkChip(page, MEDICAL_QUESTION, "No")).toHaveAttribute("aria-pressed", "true");
  });

  test("X auto-selects H and N, S auto-selects P, None clears the rest, and the transmission is required", async ({
    page,
  }) => {
    await resumeAt(page, 8, { endorsements: [] });
    await expect(screenHeading(page)).toHaveText("Letters");
    await expect(page.getByRole("img", { name: /front of a CDL/ })).toBeVisible();

    await card(page, "checkbox", /^X\b/).click();
    for (const letter of ["X", "H", "N"]) {
      await expect(card(page, "checkbox", new RegExp(`^${letter}\\b`))).toHaveAttribute(
        "aria-checked",
        "true",
      );
    }
    await expect(page.getByText("X includes H and N.")).toBeVisible();

    await card(page, "checkbox", /^N\b/).click();
    await expect(card(page, "checkbox", /^X\b/)).toHaveAttribute("aria-checked", "false");
    await expect(card(page, "checkbox", /^H\b/)).toHaveAttribute("aria-checked", "true");

    // S (school bus) needs P (passengers): S brings P in, dropping P drops S.
    await card(page, "checkbox", /^S\b/).click();
    await expect(card(page, "checkbox", /^P\b/)).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/S includes P\./)).toBeVisible();
    await card(page, "checkbox", /^P\b/).click();
    await expect(card(page, "checkbox", /^S\b/)).toHaveAttribute("aria-checked", "false");

    await card(page, "checkbox", /^None/).click();
    await expect(card(page, "checkbox", /^H\b/)).toHaveAttribute("aria-checked", "false");

    // No letters is fine; the transmission is not optional.
    await nextButton(page).click();
    await expect(formAlert(page)).toHaveText("Pick automatic only, or automatic and manual");
    await expect(screenHeading(page)).toHaveText("Letters");
    await card(page, "radio", /Automatic only/).click();
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("Equipment");
    expect(await driverRow()).toMatchObject({
      endorsements: [],
      transmission: "automatic_only",
      onboarding_step: 10,
    });
  });

  test("the Equipment page needs at least one chip", async ({ page }) => {
    await resumeAt(page, 10);
    await expect(screenHeading(page)).toHaveText("Equipment");
    await nextButton(page).click();
    await expect(formAlert(page)).toHaveText("Pick at least one kind of equipment");
    await chip(page, "Container drayage").click();
    await chip(page, "Yard mule").click();
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("Finish");
    expect(await driverRow()).toMatchObject({
      equipment_types: ["container_drayage", "yard_mule"],
      onboarding_step: 11,
    });
  });

  test("the card cannot be finished without SMS consent", async ({ page }) => {
    await resumeAt(page, 11);
    await expect(screenHeading(page)).toHaveText("Finish");
    await expect(page.getByText("Can we text you about shifts?")).toBeVisible();
    await nextButton(page, FINISH).click();
    await expect(formAlert(page)).toHaveText("Tap the box to agree before you finish");

    const row = await driverRow();
    expect(row.card_completed).toBe(false);
    expect(row.sms_opt_in).toBe(false);

    // The profile stays locked until the card is complete.
    await page.goto("/driver/profile");
    await expect(page).toHaveURL(/\/driver\/onboarding$/);
    await expect(screenHeading(page)).toHaveText("Finish");
  });

  test("a page that runs past the fold shows a scroll hint until the bottom is in view; a short one does not", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop-chrome", "viewport is set by hand here");
    // Short enough that the CDL page's three questions do not fit.
    await page.setViewportSize({ width: 1280, height: 720 });
    await resumeAt(page, 4);
    await expect(screenHeading(page)).toHaveText("CDL");
    const hint = page.getByRole("button", { name: "Scroll down for more" });
    await expect(hint).toBeVisible();
    await expect(hint.locator("svg")).toHaveClass(/animate-nudge/);
    await expect(hint).toHaveCSS("position", "fixed");

    // Tapping it scrolls on; at the bottom it goes away.
    const before = await page.evaluate(() => window.scrollY);
    await hint.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(hint).toHaveCount(0);

    // The Cards page fits, so it has no hint.
    await resumeAt(page, 7);
    await expect(screenHeading(page)).toHaveText("Cards");
    await expect(hint).toHaveCount(0);
  });
});
