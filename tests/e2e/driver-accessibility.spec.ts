import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, login, PHONES, requestCode, resetUser, seedUser } from "./helpers";

const CONSENT_TEXT =
  "I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.";

async function expectNoAccessibilityViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .exclude("nextjs-portal")
    .analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(summary, label).toEqual([]);
}

const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true });

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`signed-in screens are accessible (${colorScheme})`, () => {
    test.use({ colorScheme });

    test.afterAll(async () => {
      await resetUser(PHONES.driver);
    });

    test("verify and role screens", async ({ page }) => {
      await resetUser(PHONES.driver);
      await requestCode(page, PHONES.driver);
      await expectNoAccessibilityViolations(page, "verify");

      await page.getByLabel("6-digit code").fill("123456");
      await expect(page).toHaveURL(/\/choose-role/);
      await expectNoAccessibilityViolations(page, "choose-role");
    });

    test("every onboarding step, including validation errors", async ({ page }) => {
      await seedUser(PHONES.driver, "driver");
      await login(page, PHONES.driver);
      await expect(page).toHaveURL(/\/driver\/onboarding$/);
      await expectNoAccessibilityViolations(page, "step 1");

      await next(page).click();
      await expect(page.getByText("Enter your full name")).toBeVisible();
      await expectNoAccessibilityViolations(page, "step 1 with errors");

      await page.getByLabel("Full name").fill("Pat Driver");
      await page.getByLabel("State").selectOption("TX");
      await page.getByLabel("ZIP code").fill("75201");
      await next(page).click();

      await page.getByText("CDL driver", { exact: true }).click();
      await page.getByText("Class A", { exact: true }).click();
      await page.getByLabel("Years of experience").fill("9");
      await page.getByRole("textbox", { name: "Certifications" }).fill("TWIC");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expectNoAccessibilityViolations(page, "step 2");
      await next(page).click();

      await page.getByText("Full time", { exact: true }).click();
      await expectNoAccessibilityViolations(page, "step 3");
      await next(page).click();

      await expect(page.getByText("No documents yet")).toBeVisible();
      await expectNoAccessibilityViolations(page, "step 4");
      await page.getByRole("button", { name: "Continue" }).click();

      await page.getByRole("button", { name: "Finish" }).click();
      await expect(page.getByText("You must agree to receive text messages")).toBeVisible();
      await expectNoAccessibilityViolations(page, "step 5 with error");

      await page.getByRole("checkbox", { name: CONSENT_TEXT }).check();
      await page.getByRole("button", { name: "Finish" }).click();
      await expect(page.getByText(/Your profile is under review/)).toBeVisible();
      await expectNoAccessibilityViolations(page, "done");
    });

    test("profile and documents", async ({ page }) => {
      const userId = await seedUser(PHONES.driver, "driver");
      const { data, error } = await adminClient()
        .from("drivers")
        .insert({
          profile_id: userId,
          full_name: "Pat Driver",
          state: "TX",
          zip: "75201",
          operator_types: ["cdl_driver"],
          cdl_class: "A",
          endorsements: ["H"],
          years_experience: 8,
          certifications: ["TWIC"],
          availability: ["full_time"],
          sms_opt_in: true,
          sms_opt_in_at: new Date().toISOString(),
          sms_opt_in_text: CONSENT_TEXT,
          sms_opted_out: true,
          sms_opted_out_at: new Date().toISOString(),
          onboarding_step: 6,
          card_completed: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      await adminClient()
        .from("driver_documents")
        .insert({
          driver_id: data.id,
          type: "cdl_front",
          storage_path: `${data.id}/00000000-0000-4000-8000-000000000001.jpg`,
          file_name: "cdl.jpg",
          mime_type: "image/jpeg",
          size_bytes: 1000,
        });

      await login(page, PHONES.driver);
      await expect(page).toHaveURL(/\/driver\/profile$/);
      await expectNoAccessibilityViolations(page, "profile");

      await page.goto("/driver/documents");
      await expect(page.getByRole("list", { name: "Uploaded documents" })).toBeVisible();
      await expectNoAccessibilityViolations(page, "documents");

      await page.getByRole("button", { name: "Delete cdl.jpg" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      // Let the open animation finish: mid-fade colors are not what people read.
      await page.waitForTimeout(400);
      await expectNoAccessibilityViolations(page, "delete dialog");
    });
  });
}
