import { expect, test, type Page } from "@playwright/test";
import { adminClient, formAlert, login, PHONES, seedUser } from "./helpers";

const CONSENT_TEXT =
  "I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.";

async function startAsNewDriver(page: Page) {
  await seedUser(PHONES.driver, "driver");
  await login(page, PHONES.driver);
  await expect(page).toHaveURL(/\/driver\/onboarding$/);
}

const stepHeading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 2, name, exact: true });
const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true });

async function fillBasics(page: Page) {
  await expect(stepHeading(page, "Your basics")).toBeVisible();
  await page.getByLabel("Full name").fill("Pat Driver");
  await page.getByLabel("City").fill("Dallas");
  await page.getByLabel("State").selectOption("TX");
  await page.getByLabel("ZIP code").fill("75201");
  await page.getByLabel("Service radius (miles)").fill("120");
  await next(page).click();
}

async function fillLicenses(page: Page) {
  await expect(stepHeading(page, "Role and licenses")).toBeVisible();
  await page.getByText("CDL driver", { exact: true }).click();
  await page.getByText("Yard spotter", { exact: true }).click();
  await page.getByText("Class A", { exact: true }).click();
  await page.getByText("H - Hazardous materials").click();
  await page.getByText("T - Double/triple trailers").click();
  await page.getByLabel("Years of experience").fill("9");
  await page.getByRole("textbox", { name: "Certifications" }).fill("TWIC");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("textbox", { name: "Certifications" }).fill("OSHA 10");
  await page.getByRole("textbox", { name: "Certifications" }).press("Enter");
  await next(page).click();
}

async function fillAvailability(page: Page) {
  await expect(stepHeading(page, "Availability")).toBeVisible();
  await page.getByText("Full time", { exact: true }).click();
  await page.getByText("Weekends", { exact: true }).click();
  await page.getByLabel("About you").fill("Nine years of regional haul. Clean record.");
  await next(page).click();
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

test.describe("driver onboarding", () => {
  test("a driver completes the qualification card and every field is stored", async ({ page }) => {
    await startAsNewDriver(page);
    await expect(page.getByText("Step 1 of 5")).toBeVisible();

    await fillBasics(page);
    await expect(page.getByText("Step 2 of 5")).toBeVisible();
    await fillLicenses(page);
    await expect(page.getByText("Step 3 of 5")).toBeVisible();
    await fillAvailability(page);

    // Step 4: documents are optional.
    await expect(stepHeading(page, "Documents")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 5: consent starts unchecked and shows the exact text.
    await expect(stepHeading(page, "Text message consent")).toBeVisible();
    const consent = page.getByRole("checkbox", { name: CONSENT_TEXT });
    await expect(consent).not.toBeChecked();
    await consent.check();
    const before = Date.now();
    await page.getByRole("button", { name: "Finish" }).click();

    await expect(
      page.getByText("Your profile is under review. You'll get texts when matching shifts open."),
    ).toBeVisible();

    const row = await driverRow();
    expect(row).toMatchObject({
      full_name: "Pat Driver",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      service_radius_miles: 120,
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
      onboarding_step: 6,
      card_completed: true,
    });
    const consentAt = new Date(row.sms_opt_in_at!).getTime();
    expect(consentAt).toBeGreaterThanOrEqual(before - 5_000);
    expect(consentAt).toBeLessThanOrEqual(Date.now() + 5_000);

    // The profile is now reachable, and onboarding shows the done screen.
    await page.getByRole("link", { name: "View my profile" }).click();
    await expect(page).toHaveURL(/\/driver\/profile$/);
    await page.goto("/driver/onboarding");
    await expect(page.getByText("Your profile is under review.")).toBeVisible();
  });

  test("a refresh mid-flow resumes at the right step with saved data", async ({ page }) => {
    await startAsNewDriver(page);
    await fillBasics(page);
    await fillLicenses(page);
    await expect(stepHeading(page, "Availability")).toBeVisible();

    await page.reload();
    await expect(stepHeading(page, "Availability")).toBeVisible();
    await expect(page.getByText("Step 3 of 5")).toBeVisible();

    const row = await driverRow();
    expect(row.onboarding_step).toBe(3);
    expect(row.card_completed).toBe(false);

    // Logging out and back in resumes at the same step too.
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, PHONES.driver);
    await expect(stepHeading(page, "Availability")).toBeVisible();
  });

  test("back navigation keeps the saved data", async ({ page }) => {
    await startAsNewDriver(page);
    await fillBasics(page);
    await fillLicenses(page);
    await expect(stepHeading(page, "Availability")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(stepHeading(page, "Role and licenses")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "CDL driver" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Yard spotter" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Mechanic" })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: "Class A" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "H - Hazardous materials" })).toBeChecked();
    await expect(page.getByLabel("Years of experience")).toHaveValue("9");
    await expect(page.getByText("TWIC", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(stepHeading(page, "Your basics")).toBeVisible();
    await expect(page.getByLabel("Full name")).toHaveValue("Pat Driver");
    await expect(page.getByLabel("State")).toHaveValue("TX");
    await expect(page.getByLabel("ZIP code")).toHaveValue("75201");
    await expect(page.getByLabel("Service radius (miles)")).toHaveValue("120");

    // Changing an earlier step saves it and does not lose progress.
    await page.getByLabel("City").fill("Fort Worth");
    await next(page).click();
    await expect(stepHeading(page, "Role and licenses")).toBeVisible();
    const row = await driverRow();
    expect(row.city).toBe("Fort Worth");
    expect(row.onboarding_step).toBe(3);
  });

  test("validation errors are shown per field and block the step", async ({ page }) => {
    await startAsNewDriver(page);
    await next(page).click();

    await expect(page.getByText("Enter your full name")).toBeVisible();
    await expect(page.getByText("Select your state")).toBeVisible();
    await expect(page.getByText("Enter a 5-digit ZIP code")).toBeVisible();
    await expect(stepHeading(page, "Your basics")).toBeVisible();

    await page.getByLabel("Full name").fill("Pat Driver");
    await page.getByLabel("State").selectOption("TX");
    await page.getByLabel("ZIP code").fill("7520");
    await page.getByLabel("Service radius (miles)").fill("2");
    await next(page).click();
    await expect(page.getByText("Enter a 5-digit ZIP code")).toBeVisible();
    await expect(page.getByText("Radius must be at least 5 miles")).toBeVisible();

    await page.getByLabel("ZIP code").fill("75201");
    await page.getByLabel("Service radius (miles)").fill("50");
    await next(page).click();

    // Step 2 with nothing selected.
    await expect(stepHeading(page, "Role and licenses")).toBeVisible();
    await next(page).click();
    await expect(page.getByText("Select at least one role")).toBeVisible();
    await expect(page.getByText("Select your CDL class")).toBeVisible();
    await expect(page.getByText("Enter your years of experience")).toBeVisible();
  });

  test("endorsements only appear with a CDL class", async ({ page }) => {
    await startAsNewDriver(page);
    await fillBasics(page);
    await expect(stepHeading(page, "Role and licenses")).toBeVisible();

    await page.getByText("No CDL", { exact: true }).click();
    await expect(page.getByText("Endorsements")).toBeHidden();

    await page.getByText("Class B", { exact: true }).click();
    await expect(page.getByText("Endorsements", { exact: true })).toBeVisible();
  });

  test("the bio counter tracks length and blocks more than 500 characters", async ({ page }) => {
    await startAsNewDriver(page);
    await fillBasics(page);
    await fillLicenses(page);
    await expect(stepHeading(page, "Availability")).toBeVisible();

    await page.getByLabel("About you").fill("Hello");
    await expect(page.getByText("5/500")).toBeVisible();

    await page.getByText("On call", { exact: true }).click();
    await page.getByLabel("About you").fill("x".repeat(501));
    await expect(page.getByText("501/500")).toBeVisible();
    await next(page).click();
    await expect(page.getByText("Bio must be 500 characters or fewer")).toBeVisible();
    await expect(stepHeading(page, "Availability")).toBeVisible();
  });

  test("the card cannot be finished without SMS consent", async ({ page }) => {
    await startAsNewDriver(page);
    await fillBasics(page);
    await fillLicenses(page);
    await fillAvailability(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(stepHeading(page, "Text message consent")).toBeVisible();

    await page.getByRole("button", { name: "Finish" }).click();
    await expect(formAlert(page)).toHaveText("You must agree to receive text messages to continue");
    await expect(stepHeading(page, "Text message consent")).toBeVisible();

    const row = await driverRow();
    expect(row.card_completed).toBe(false);
    expect(row.sms_opt_in).toBe(false);
    expect(row.sms_opt_in_text).toBeNull();

    // The profile stays locked until the card is complete.
    await page.goto("/driver/profile");
    await expect(page).toHaveURL(/\/driver\/onboarding$/);
    await expect(stepHeading(page, "Text message consent")).toBeVisible();
  });
});
