import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  CONSENT_TEXT,
  formAlert,
  login,
  nextButton,
  PHONE_VIEWPORT,
  PHONES,
  PLACES,
  resetUser,
  screenHeading,
  seedDriverAtStep,
  seedUser,
} from "./helpers";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

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

test.describe("driver onboarding, one question per screen", () => {
  // The per-question flow is the phone layout. Wider screens group a mile per page and are
  // covered by the "on a wide screen" tests below, so every project runs this at phone width.
  test.use({ viewport: PHONE_VIEWPORT });

  test.afterAll(async () => {
    await resetUser(PHONES.driver);
  });

  test("a driver signs up with taps only, in under five minutes, and every answer is stored", async ({
    page,
  }) => {
    const started = Date.now();
    await startAsNewDriver(page);

    // Mile 1: About
    await expect(screenHeading(page)).toHaveText("What is your name?");
    await expect(page.getByText("Mile 1 of 5 · About")).toBeVisible();
    await page.getByLabel("Full name").fill("Pat Driver");
    await nextButton(page).click();

    await expect(screenHeading(page)).toHaveText("What is your ZIP code?");
    await page.getByLabel("ZIP code", { exact: true }).fill(PLACES.houston.zip);
    await expect(page.getByLabel("City")).toHaveValue("Houston");
    await expect(page.getByRole("combobox", { name: "State" })).toHaveText("Texas");
    await expect(page.getByText(/City and state filled in from your ZIP/)).toBeVisible();
    // Houston is inside the launch area: no note.
    await expect(page.locator("[data-slot=launch-area-note]")).toHaveCount(0);
    await nextButton(page).click();

    await expect(screenHeading(page)).toHaveText("How far will you travel for work?");
    await chip(page, "100 miles").click();
    await nextButton(page).click();

    // Mile 2: Work
    await expect(screenHeading(page)).toHaveText("What work do you do?");
    await expect(page.getByText("Mile 2 of 5 · Work")).toBeVisible();
    await card(page, "checkbox", /CDL driver/).click();
    await card(page, "checkbox", /Yard spotter/).click();
    await nextButton(page).click();

    await expect(screenHeading(page)).toHaveText("How many years have you done this work?");
    await chip(page, "6 to 10").click();
    await page.getByRole("button", { name: "One year more" }).click();
    await page.getByRole("button", { name: "One year more" }).click();
    await page.getByRole("button", { name: "One year more" }).click();
    await expect(page.getByLabel("Exact number (optional)")).toHaveValue("9");
    await nextButton(page).click();

    await expect(screenHeading(page)).toHaveText("When can you work?");
    await card(page, "checkbox", /Full time/).click();
    await card(page, "checkbox", /Weekends/).click();
    await nextButton(page).click();

    // Mile 3: License
    await expect(screenHeading(page)).toHaveText("What class is your CDL?");
    await expect(page.getByText("Mile 3 of 5 · License")).toBeVisible();
    await card(page, "radio", /Class A/).click();
    await nextButton(page).click();

    await expect(screenHeading(page)).toHaveText("Any extra letters on your CDL?");
    await expect(page.getByText(/These are called endorsements/)).toBeVisible();
    await card(page, "checkbox", /^H\b/).click();
    await card(page, "checkbox", /^T\b/).click();
    await nextButton(page).click();

    await expect(screenHeading(page)).toHaveText("Do you have any certifications?");
    await chip(page, "TWIC").click();
    await chip(page, "OSHA 10").click();
    await nextButton(page).click();

    // Mile 4: Papers (optional)
    await expect(screenHeading(page)).toHaveText("Do you want to add your papers now?");
    await expect(page.getByText("Mile 4 of 5 · Papers")).toBeVisible();
    await nextButton(page, "Skip for now").click();

    // Mile 5: Finish
    await expect(screenHeading(page)).toHaveText("Anything carriers should know?");
    await expect(page.getByText("Mile 5 of 5 · Finish")).toBeVisible();
    await page.getByLabel("About you").fill("Nine years of regional haul. Clean record.");
    await nextButton(page).click();

    await expect(screenHeading(page)).toHaveText("Can we text you about shifts?");
    const consent = page.getByRole("checkbox", { name: new RegExp(CONSENT_TEXT.slice(0, 30)) });
    await expect(consent).not.toBeChecked();
    await consent.click();
    const before = Date.now();
    await nextButton(page, "Agree and finish").click();

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
      operator_types: ["cdl_driver", "yard_spotter"],
      cdl_class: "A",
      endorsements: ["H", "T"],
      years_experience: 9,
      certifications: ["TWIC", "OSHA 10"],
      availability: ["full_time", "weekends"],
      bio: "Nine years of regional haul. Clean record.",
      sms_opt_in: true,
      sms_opt_in_text: CONSENT_TEXT,
      sms_opted_out: false,
      onboarding_step: 13,
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

    // The summary can send the driver back to a question, and the profile is now open.
    await page.getByRole("button", { name: "Edit availability" }).click();
    await expect(screenHeading(page)).toHaveText("When can you work?");
    await expect(card(page, "checkbox", /Full time/)).toHaveAttribute("aria-checked", "true");
    await page.goto("/driver/onboarding");
    await expect(screenHeading(page)).toHaveText("You are listed.");
    await page.getByRole("link", { name: "Go to my profile" }).click();
    await expect(page).toHaveURL(/\/driver\/profile$/);
  });

  test("a driver outside the launch area is told so, still signs up, and is marked on the profile", async ({
    page,
  }) => {
    await resumeAt(page, 2);
    await expect(screenHeading(page)).toHaveText("What is your ZIP code?");
    const note = page.locator("[data-slot=launch-area-note]");
    const zip = page.getByLabel("ZIP code", { exact: true });

    await zip.fill(PLACES.dallas.zip);
    await expect(page.getByLabel("City")).toHaveValue("Dallas");
    await expect(note).toBeVisible();
    await expect(note).toHaveText(
      "FleetGrid is launching in the Houston area first. You can still sign up. We'll text you when we launch near you.",
    );
    // Information only: no error, nothing invalid, Next stays on.
    await expect(formAlert(page)).toHaveCount(0);
    await expect(nextButton(page)).toBeEnabled();

    // A Houston ZIP clears the note; back to Dallas brings it back.
    await zip.fill(PLACES.houston.zip);
    await expect(page.getByLabel("City")).toHaveValue("Houston");
    await expect(note).toHaveCount(0);
    await zip.fill(PLACES.dallas.zip);
    await expect(note).toBeVisible();
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("How far will you travel for work?");
    expect(await driverRow()).toMatchObject({
      zip: "75201",
      lat: PLACES.dallas.lat,
      lng: PLACES.dallas.lng,
    });

    // Finish from the consent screen with the Dallas card.
    await resumeAt(page, 12, { ...PLACES.dallas });
    await expect(screenHeading(page)).toHaveText("Can we text you about shifts?");
    await page.getByRole("checkbox", { name: new RegExp(CONSENT_TEXT.slice(0, 30)) }).click();
    await nextButton(page, "Agree and finish").click();

    await expect(screenHeading(page)).toHaveText("You're on the list.");
    await expect(page.getByText("Profile complete", { exact: true })).toBeVisible();
    await expect(
      page.getByText("FleetGrid isn't in your area yet. We'll text you when it is."),
    ).toBeVisible();
    await expect(page.getByText(/Shift offers arrive by text/)).toHaveCount(0);
    await expect(page.locator("[data-slot=summary-card]")).toBeVisible();
    expect(await driverRow()).toMatchObject({ card_completed: true, onboarding_step: 13 });

    await page.getByRole("link", { name: "Go to my profile" }).click();
    await expect(page).toHaveURL(/\/driver\/profile$/);
    const status = page.getByRole("region", { name: "Account status" });
    await expect(status.getByText("Outside launch area")).toBeVisible();
    await expect(status.locator("[data-slot=launch-area-help]")).toHaveText(
      "FleetGrid is launching in the Houston area first. We'll text you when we launch near you.",
    );
  });

  test("a refresh mid-flow resumes on the same question with the saved answers", async ({
    page,
  }) => {
    await resumeAt(page, 5);
    await expect(screenHeading(page)).toHaveText("How many years have you done this work?");
    await chip(page, "3 to 5").click();
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("When can you work?");

    await page.reload();
    await expect(screenHeading(page)).toHaveText("When can you work?");
    await expect(page.getByText("Mile 2 of 5 · Work")).toBeVisible();
    expect((await driverRow()).onboarding_step).toBe(6);

    // Logging out and back in resumes there too.
    await page.goto("/driver/profile");
    await expect(page).toHaveURL(/\/driver\/onboarding$/);
    await expect(screenHeading(page)).toHaveText("When can you work?");
  });

  test("Back keeps the saved answers, and changing one never loses progress", async ({ page }) => {
    await resumeAt(page, 6);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(screenHeading(page)).toHaveText("How many years have you done this work?");
    await expect(chip(page, "6 to 10")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Exact number (optional)")).toHaveValue("8");

    await page.getByRole("button", { name: "Back" }).click();
    await expect(screenHeading(page)).toHaveText("What work do you do?");
    await expect(card(page, "checkbox", /CDL driver/)).toHaveAttribute("aria-checked", "true");

    await card(page, "checkbox", /Mechanic/).click();
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("How many years have you done this work?");
    await expect(page.getByText("Saved")).toBeVisible();
    const row = await driverRow();
    expect(row.operator_types).toEqual(["cdl_driver", "mechanic"]);
    expect(row.onboarding_step).toBe(6);
  });

  test("errors appear only after Next, with an icon, and are specific", async ({ page }) => {
    await startAsNewDriver(page);
    await expect(formAlert(page)).toHaveCount(0);
    await page.getByLabel("Full name").fill("P");
    await expect(formAlert(page)).toHaveCount(0);

    await nextButton(page).click();
    const error = formAlert(page);
    await expect(error).toHaveText("Enter your name");
    await expect(error.locator("svg")).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
    await expect(screenHeading(page)).toHaveText("What is your name?");

    await page.getByLabel("Full name").fill("Pat Driver");
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("What is your ZIP code?");
    await page.getByLabel("ZIP code", { exact: true }).fill("7520");
    await nextButton(page).click();
    await expect(page.getByText("Enter a 5-digit ZIP code, like 60601")).toBeVisible();
    await expect(page.getByText("Select your state")).toBeVisible();
  });

  test("a CDL driver who picks No CDL sees the warning and cannot continue", async ({ page }) => {
    await resumeAt(page, 7);
    await expect(screenHeading(page)).toHaveText("What class is your CDL?");
    await expect(nextButton(page)).toBeEnabled();

    await card(page, "radio", /No CDL/).click();
    await expect(formAlert(page)).toHaveText(
      "CDL driver work needs a CDL. Pick your class, or change your work type.",
    );
    await expect(nextButton(page)).toBeDisabled();

    await card(page, "radio", /Class B/).click();
    await expect(formAlert(page)).toHaveCount(0);
    await expect(nextButton(page)).toBeEnabled();
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("Any extra letters on your CDL?");
  });

  test("endorsements are skipped for a driver without a CDL", async ({ page }) => {
    await resumeAt(page, 7, { operator_types: ["yard_spotter"] });
    await card(page, "radio", /No CDL/).click();
    await expect(formAlert(page)).toHaveCount(0);
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("Do you have any certifications?");
    expect((await driverRow()).endorsements).toEqual([]);

    await page.getByRole("button", { name: "Back" }).click();
    await expect(screenHeading(page)).toHaveText("What class is your CDL?");
  });

  test("X auto-selects H and N, S auto-selects P, and None clears the rest", async ({ page }) => {
    await resumeAt(page, 8, { endorsements: [] });
    await expect(screenHeading(page)).toHaveText("Any extra letters on your CDL?");
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
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("Do you have any certifications?");
    expect((await driverRow()).endorsements).toEqual([]);
  });

  test("the card cannot be finished without SMS consent", async ({ page }) => {
    await resumeAt(page, 12);
    await expect(screenHeading(page)).toHaveText("Can we text you about shifts?");
    await nextButton(page, "Agree and finish").click();
    await expect(formAlert(page)).toHaveText("Tap the box to agree before you finish");

    const row = await driverRow();
    expect(row.card_completed).toBe(false);
    expect(row.sms_opt_in).toBe(false);

    // The profile stays locked until the card is complete.
    await page.goto("/driver/profile");
    await expect(page).toHaveURL(/\/driver\/onboarding$/);
    await expect(screenHeading(page)).toHaveText("Can we text you about shifts?");
  });

  test("the about-you counter tracks length and blocks more than 500 characters", async ({
    page,
  }) => {
    await resumeAt(page, 11);
    await page.getByLabel("About you").fill("Hello");
    await expect(page.getByText("5 / 500")).toBeVisible();
    await page.getByLabel("About you").fill("x".repeat(501));
    await expect(page.getByText("501 / 500")).toBeVisible();
    await nextButton(page).click();
    await expect(page.getByText("Keep it to 500 characters or fewer")).toBeVisible();
    await expect(screenHeading(page)).toHaveText("Anything carriers should know?");
  });
});

test.describe("driver onboarding, a mile per page on a wide screen", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, "desktop layout only");

  test.afterAll(async () => {
    await resetUser(PHONES.driver);
  });

  test("a driver finishes mile by mile, and every answer is stored", async ({ page }) => {
    await startAsNewDriver(page);

    await expect(screenHeading(page)).toHaveText("About");
    await expect(page.getByText("Mile 1 of 5", { exact: true })).toBeVisible();
    await page.getByLabel("Full name").fill("Pat Driver");
    await page.getByLabel("ZIP code", { exact: true }).fill(PLACES.houston.zip);
    await expect(page.getByLabel("City")).toHaveValue("Houston");
    await chip(page, "100 miles").click();
    await nextButton(page).click();

    await expect(screenHeading(page)).toHaveText("Work");
    await expect(screenHeading(page)).toBeFocused();
    await card(page, "checkbox", /CDL driver/).click();
    await chip(page, "6 to 10").click();
    await card(page, "checkbox", /Full time/).click();
    await nextButton(page).click();

    await expect(screenHeading(page)).toHaveText("License");
    await card(page, "radio", /Class A/).click();
    await card(page, "checkbox", /^H\b/).click();
    await chip(page, "TWIC").click();
    await nextButton(page).click();

    await expect(screenHeading(page)).toHaveText("Papers");
    await nextButton(page, "Skip for now").click();

    await expect(screenHeading(page)).toHaveText("Finish");
    await page.getByLabel("About you").fill("Regional haul.");
    await page.getByRole("checkbox", { name: new RegExp(CONSENT_TEXT.slice(0, 30)) }).click();
    await nextButton(page, "Agree and finish").click();

    await expect(screenHeading(page)).toHaveText("You are listed.");
    expect(await driverRow()).toMatchObject({
      full_name: "Pat Driver",
      zip: "77002",
      city: "Houston",
      state: "TX",
      service_radius_miles: 100,
      operator_types: ["cdl_driver"],
      years_experience: 6,
      availability: ["full_time"],
      cdl_class: "A",
      endorsements: ["H"],
      certifications: ["TWIC"],
      bio: "Regional haul.",
      sms_opt_in: true,
      onboarding_step: 13,
      card_completed: true,
    });
  });

  test("the Work mile shows a scroll hint until the bottom is in view, and no other mile does", async ({
    page,
  }) => {
    // Short enough that the Work mile's three questions do not fit.
    await page.setViewportSize({ width: 1280, height: 720 });
    await resumeAt(page, 4);
    await expect(screenHeading(page)).toHaveText("Work");
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

    // Only the Work mile has it for now.
    await resumeAt(page, 2);
    await expect(screenHeading(page)).toHaveText("About");
    await expect(hint).toHaveCount(0);
    await resumeAt(page, 7);
    await expect(screenHeading(page)).toHaveText("License");
    await expect(hint).toHaveCount(0);
  });

  test("a mile's questions are validated together, and Back returns a whole mile", async ({
    page,
  }) => {
    await resumeAt(page, 5);
    await expect(screenHeading(page)).toHaveText("Work");
    await expect(card(page, "checkbox", /CDL driver/)).toHaveAttribute("aria-checked", "true");
    await expect(formAlert(page)).toHaveCount(0);

    // Availability is still unanswered, so the mile cannot be saved yet.
    await nextButton(page).click();
    await expect(page.getByText("Pick at least one option")).toBeVisible();
    await expect(screenHeading(page)).toHaveText("Work");

    await page.getByRole("button", { name: "Back" }).click();
    await expect(screenHeading(page)).toHaveText("About");
    await expect(page.getByLabel("Full name")).toHaveValue("Pat Driver");
    await expect(chip(page, "50 miles")).toHaveAttribute("aria-pressed", "true");
  });

  test("a mile's questions share one page", async ({ page }) => {
    await resumeAt(page, 4);
    await expect(screenHeading(page)).toHaveText("Work");
    await expect(page.getByText("Mile 2 of 5", { exact: true })).toBeVisible();
    for (const question of [
      "What work do you do?",
      "How many years have you done this work?",
      "When can you work?",
    ]) {
      await expect(page.getByText(question)).toBeVisible();
    }
    await card(page, "checkbox", /Mechanic/).click();
    await chip(page, "1 to 2").click();
    await card(page, "checkbox", /On call/).click();
    await nextButton(page).click();
    await expect(screenHeading(page)).toHaveText("License");
    const row = await driverRow();
    expect(row).toMatchObject({
      operator_types: ["mechanic"],
      years_experience: 1,
      availability: ["on_call"],
      onboarding_step: 7,
    });
  });
});
