import { expect, test, type Page } from "@playwright/test";
import { adminClient, displayPhone, login, PHONES, PLACES, resetUser, seedUser } from "./helpers";

const CONSENT_TEXT =
  "I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.";

type Status = "pending" | "approved" | "blocked";

/** A driver with a completed card, signed in on the profile page. */
async function startWithCompletedCard(
  page: Page,
  options: { status?: Status; optedOut?: boolean; place?: keyof typeof PLACES } = {},
): Promise<string> {
  const userId = await seedUser(PHONES.driver, "driver", options.status ?? "pending");
  const place = PLACES[options.place ?? "houston"];
  const { data, error } = await adminClient()
    .from("drivers")
    .insert({
      profile_id: userId,
      full_name: "Pat Driver",
      city: place.city,
      state: place.state,
      zip: place.zip,
      lat: place.lat,
      lng: place.lng,
      service_radius_miles: 50,
      operator_types: ["cdl_driver"],
      employment_type: "w2",
      cdl_class: "A",
      endorsements: ["H"],
      years_experience: 8,
      certifications: ["OSHA 10"],
      driving_styles: ["local_day_cab"],
      transmission: "manual_ok",
      equipment_types: ["dry_van"],
      twic_active: true,
      medical_card_active: true,
      clearinghouse_registered: true,
      mvr_status: "clean",
      availability: ["full_time"],
      bio: "Reliable and on time.",
      sms_opt_in: true,
      sms_opt_in_at: new Date().toISOString(),
      sms_opt_in_text: CONSENT_TEXT,
      sms_opted_out: options.optedOut ?? false,
      sms_opted_out_at: options.optedOut ? new Date().toISOString() : null,
      onboarding_step: 18,
      card_completed: true,
    })
    .select("id")
    .single();
  if (error) throw error;

  await login(page, PHONES.driver);
  await expect(page).toHaveURL(/\/driver\/profile$/);
  return data.id;
}

test.describe("driver profile", () => {
  test.afterAll(async () => {
    await resetUser(PHONES.driver);
  });

  test("shows the saved card, account status and SMS status", async ({ page }) => {
    await startWithCompletedCard(page);
    const status = page.getByRole("region", { name: "Account status" });

    await expect(status.getByText("Pending review")).toBeVisible();
    await expect(status.getByText("Subscribed")).toBeVisible();
    await expect(status.getByText(displayPhone(PHONES.driver))).toBeVisible();

    await expect(page.getByLabel("Full name")).toHaveValue("Pat Driver");
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Houston, TX");
    await expect(page.getByLabel("City")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "W-2 employee" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Class A" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "6 to 10" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Local day cab" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Dry van" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Automatic and manual" })).toBeChecked();
    await expect(
      page.getByRole("group", { name: "Do you have an active TWIC card?" }).getByRole("radio", {
        name: "Yes",
      }),
    ).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Full time" })).toBeChecked();
    await expect(page.getByLabel("About you")).toHaveValue("Reliable and on time.");
  });

  test("a driver inside the launch area has no launch-area badge", async ({ page }) => {
    await startWithCompletedCard(page);
    const status = page.getByRole("region", { name: "Account status" });
    await expect(status.getByText("Pending review")).toBeVisible();
    await expect(status.getByText("Outside launch area")).toHaveCount(0);
    await expect(status.locator("[data-slot=launch-area-help]")).toHaveCount(0);
  });

  test("a driver outside the launch area is marked, with one sentence saying why", async ({
    page,
  }) => {
    await startWithCompletedCard(page, { place: "dallas" });
    const status = page.getByRole("region", { name: "Account status" });
    await expect(status.getByText("Outside launch area")).toBeVisible();
    await expect(status.locator("[data-slot=launch-area-help]")).toHaveText(
      "FleetGrid is launching in the Houston area first. We'll text you when we launch near you.",
    );
    await expect(status.getByText("Pending review")).toBeVisible();
  });

  test("an approved driver sees the approved status", async ({ page }) => {
    await startWithCompletedCard(page, { status: "approved" });
    await expect(
      page.getByRole("region", { name: "Account status" }).getByText("Approved", { exact: true }),
    ).toBeVisible();
  });

  test("an opted-out driver is told how to re-subscribe", async ({ page }) => {
    await startWithCompletedCard(page, { optedOut: true });
    const status = page.getByRole("region", { name: "Account status" });
    await expect(status.getByText("Opted out")).toBeVisible();
    await expect(status.getByText(/text START to the FleetGrid number/)).toBeVisible();
  });

  test("edits are saved and still there after a reload", async ({ page }) => {
    const driverId = await startWithCompletedCard(page);

    await page.getByLabel("Full name").fill("Patricia Driver");
    // The ZIP alone; city and state follow from the dataset.
    await page.getByLabel("ZIP code").fill("60601");
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Chicago, IL");
    await page.getByLabel("Service radius (miles)").fill("200");
    await page.getByText("Mechanic", { exact: true }).click();
    await page.getByText("Either works", { exact: true }).click();
    await page.getByText("Class B", { exact: true }).click();
    await page.getByText("T - Double/triple trailers").click();
    await page.getByText("10 or more", { exact: true }).click();
    await page.getByRole("button", { name: "Remove OSHA 10" }).click();
    await page.getByRole("textbox", { name: "Certifications" }).fill("Forklift");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("OTR (over the road)", { exact: true }).click();
    await page.getByText("Reefer", { exact: true }).click();
    await page.getByText("Automatic only", { exact: true }).click();
    await page
      .getByRole("group", { name: "Do you have an active TWIC card?" })
      .getByText("No", { exact: true })
      .click();
    await page
      .getByRole("group", { name: "Any moving violations in the last 3 years?" })
      .getByText("1 or 2 minor", { exact: true })
      .click();
    await page.getByText("Weekends", { exact: true }).click();
    await page.getByLabel("About you").fill("Fifteen years. Tanker and flatbed.");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Profile saved")).toBeVisible();

    const { data } = await adminClient().from("drivers").select("*").eq("id", driverId).single();
    expect(data).toMatchObject({
      full_name: "Patricia Driver",
      city: "Chicago",
      state: "IL",
      zip: "60601",
      lat: 41.8858,
      lng: -87.6181,
      service_radius_miles: 200,
      operator_types: ["cdl_driver", "mechanic"],
      employment_type: "either",
      cdl_class: "B",
      endorsements: ["H", "T"],
      years_experience: 10,
      certifications: ["Forklift"],
      driving_styles: ["local_day_cab", "otr"],
      transmission: "automatic_only",
      equipment_types: ["dry_van", "reefer"],
      twic_active: false,
      medical_card_active: true,
      clearinghouse_registered: true,
      mvr_status: "minor_1_2",
      availability: ["full_time", "weekends"],
      bio: "Fifteen years. Tanker and flatbed.",
      // Consent and completion are untouched by an edit.
      sms_opt_in: true,
      sms_opt_in_text: CONSENT_TEXT,
      card_completed: true,
      onboarding_step: 18,
    });

    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Patricia Driver");
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Chicago, IL");
    await expect(page.getByRole("radio", { name: "Class B" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "10 or more" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Automatic only" })).toBeChecked();
    await expect(page.getByText("Forklift", { exact: true })).toBeVisible();
  });

  test("dropping CDL work hides the CDL questions, and a mechanic saves without them", async ({
    page,
  }) => {
    const driverId = await startWithCompletedCard(page);
    const driving = page.getByRole("group", { name: "What kind of driving do you do?" });
    await expect(driving).toBeVisible();
    await page.getByText("CDL driver", { exact: true }).click();
    await page.getByText("Mechanic", { exact: true }).click();
    await page.getByText("No CDL", { exact: true }).click();
    await expect(driving).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Are you registered in the FMCSA Clearinghouse?" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Do you have an active TWIC card?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();

    const { data } = await adminClient()
      .from("drivers")
      .select("operator_types, cdl_class, card_completed")
      .eq("id", driverId)
      .single();
    expect(data).toEqual({ operator_types: ["mechanic"], cdl_class: "none", card_completed: true });
  });

  test("a ZIP the dataset does not know is rejected on the profile too", async ({ page }) => {
    const driverId = await startWithCompletedCard(page);
    const zip = page.getByLabel("ZIP code");
    await zip.fill("99999");
    await expect(page.getByText("We could not find that ZIP. Check the number.")).toBeVisible();
    await expect(page.locator("[data-slot=zip-place]")).toHaveCount(0);
    await page.getByRole("button", { name: "Save changes" }).click();
    // The server says the same, so the card keeps its Houston ZIP.
    await expect(page.getByText("We could not find that ZIP. Check the number.")).toBeVisible();
    await expect(page.getByText("Profile saved")).toHaveCount(0);
    const { data } = await adminClient()
      .from("drivers")
      .select("zip, city, state")
      .eq("id", driverId)
      .single();
    expect(data).toEqual({ zip: PLACES.houston.zip, city: "Houston", state: "TX" });
  });

  test("invalid edits are rejected and nothing is saved", async ({ page }) => {
    const driverId = await startWithCompletedCard(page);

    await page.getByLabel("ZIP code").fill("12");
    await page.getByText("Full time", { exact: true }).click();
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Enter a 5-digit ZIP code")).toBeVisible();
    await expect(page.getByText("Select at least one option")).toBeVisible();

    const { data } = await adminClient()
      .from("drivers")
      .select("zip, availability")
      .eq("id", driverId)
      .single();
    expect(data).toEqual({ zip: PLACES.houston.zip, availability: ["full_time"] });
  });

  test("the documents page is one tap away", async ({ page }) => {
    await startWithCompletedCard(page);
    await page.getByRole("link", { name: "Documents" }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/driver\/documents$/);
    await expect(page.getByRole("heading", { level: 1, name: "My documents" })).toBeVisible();
  });
});
