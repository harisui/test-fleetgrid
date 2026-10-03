import { expect, test, type Page } from "@playwright/test";
import { adminClient, displayPhone, login, PHONES, resetUser, seedUser } from "./helpers";

const CONSENT_TEXT =
  "I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.";

type Status = "pending" | "approved" | "blocked";

/** A driver with a completed card, signed in on the profile page. */
async function startWithCompletedCard(
  page: Page,
  options: { status?: Status; optedOut?: boolean } = {},
): Promise<string> {
  const userId = await seedUser(PHONES.driver, "driver", options.status ?? "pending");
  const { data, error } = await adminClient()
    .from("drivers")
    .insert({
      profile_id: userId,
      full_name: "Pat Driver",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      service_radius_miles: 50,
      operator_types: ["cdl_driver"],
      cdl_class: "A",
      endorsements: ["H"],
      years_experience: 8,
      certifications: ["TWIC"],
      availability: ["full_time"],
      bio: "Reliable and on time.",
      sms_opt_in: true,
      sms_opt_in_at: new Date().toISOString(),
      sms_opt_in_text: CONSENT_TEXT,
      sms_opted_out: options.optedOut ?? false,
      sms_opted_out_at: options.optedOut ? new Date().toISOString() : null,
      onboarding_step: 13,
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
    await expect(page.getByRole("combobox", { name: /State/ })).toHaveText("Texas");
    await expect(page.getByRole("radio", { name: "Class A" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Full time" })).toBeChecked();
    await expect(page.getByLabel("About you")).toHaveValue("Reliable and on time.");
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
    await page.getByLabel("City").fill("Austin");
    await page.getByRole("combobox", { name: /State/ }).click();
    await page.getByRole("option", { name: "Oklahoma" }).click();
    await page.getByLabel("ZIP code").fill("73301");
    await page.getByLabel("Service radius (miles)").fill("200");
    await page.getByText("Mechanic", { exact: true }).click();
    await page.getByText("Class B", { exact: true }).click();
    await page.getByText("T - Double/triple trailers").click();
    await page.getByLabel("Years of experience").fill("15");
    await page.getByRole("button", { name: "Remove TWIC" }).click();
    await page.getByRole("textbox", { name: "Certifications" }).fill("Forklift");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("Weekends", { exact: true }).click();
    await page.getByLabel("About you").fill("Fifteen years. Tanker and flatbed.");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Profile saved")).toBeVisible();

    const { data } = await adminClient().from("drivers").select("*").eq("id", driverId).single();
    expect(data).toMatchObject({
      full_name: "Patricia Driver",
      city: "Austin",
      state: "OK",
      zip: "73301",
      service_radius_miles: 200,
      operator_types: ["cdl_driver", "mechanic"],
      cdl_class: "B",
      endorsements: ["H", "T"],
      years_experience: 15,
      certifications: ["Forklift"],
      availability: ["full_time", "weekends"],
      bio: "Fifteen years. Tanker and flatbed.",
      // Consent and completion are untouched by an edit.
      sms_opt_in: true,
      sms_opt_in_text: CONSENT_TEXT,
      card_completed: true,
      onboarding_step: 13,
    });

    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Patricia Driver");
    await expect(page.getByRole("combobox", { name: /State/ })).toHaveText("Oklahoma");
    await expect(page.getByRole("radio", { name: "Class B" })).toBeChecked();
    await expect(page.getByText("Forklift", { exact: true })).toBeVisible();
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
    expect(data).toEqual({ zip: "75201", availability: ["full_time"] });
  });

  test("the documents page is one tap away", async ({ page }) => {
    await startWithCompletedCard(page);
    await page.getByRole("link", { name: "Documents" }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/driver\/documents$/);
    await expect(page.getByRole("heading", { level: 1, name: "My documents" })).toBeVisible();
  });
});
