import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { STEPS } from "../../src/lib/onboarding/steps";
import {
  adminClient,
  CONSENT_TEXT,
  enterCode,
  expectScreen,
  formAlert,
  login,
  nextButton,
  openOnboarding,
  OTP,
  PHONES,
  PLACES,
  requestCode,
  resetUser,
  screenHeading,
  seedDriverAtStep,
  seedUser,
} from "./helpers";

async function expectNoAccessibilityViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .exclude("nextjs-portal")
    .analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(summary, label).toEqual([]);
}

/** Presses Tab until the control has focus, so the test does not count every stop in between. */
async function tabTo(page: Page, target: Locator, maxStops = 12) {
  for (let stop = 0; stop < maxStops; stop += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  await expect(target).toBeFocused();
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`screens are accessible (${colorScheme})`, () => {
    test.beforeEach(async ({ page }) => {
      // Light is the app default; dark is the stored choice.
      await page
        .context()
        .addCookies([
          { name: "fleetgrid-theme", value: colorScheme, url: "http://localhost:3000" },
        ]);
      // Colors are checked at rest, not halfway through a 120ms press transition.
      await page.emulateMedia({ reducedMotion: "reduce" });
    });

    test.afterAll(async () => {
      await resetUser(PHONES.driver);
    });

    test("login, code and role screens, including an error", async ({ page }) => {
      await resetUser(PHONES.driver);
      await page.goto("/login");
      await expectNoAccessibilityViolations(page, "login");
      // An empty number is the error state, whatever ENABLE_TEST_LOGIN put there.
      await page.getByLabel("Mobile number").fill("");
      await page.getByRole("button", { name: "Text me a code" }).click();
      await expect(formAlert(page)).toBeVisible();
      await expectNoAccessibilityViolations(page, "login with error");

      await requestCode(page, PHONES.driver);
      await expectNoAccessibilityViolations(page, "verify");

      await enterCode(page, OTP);
      await expect(page).toHaveURL(/\/choose-role/);
      await expectNoAccessibilityViolations(page, "choose-role");
      await page.getByRole("radio", { name: /I drive or work trucks/ }).click();
      await expectNoAccessibilityViolations(page, "choose-role selected");
    });

    for (const step of STEPS) {
      const stepNumber = STEPS.indexOf(step) + 1;
      test(`onboarding screen ${stepNumber}: ${step.id}`, async ({ page }) => {
        await seedDriverAtStep(PHONES.driver, stepNumber);
        await openOnboarding(page, PHONES.driver);
        await expectScreen(page, step.question);
        await expectNoAccessibilityViolations(page, step.id);
      });
    }

    test("onboarding error, warning and selected states", async ({ page }) => {
      await seedDriverAtStep(PHONES.driver, 1);
      await openOnboarding(page, PHONES.driver);
      await nextButton(page).click();
      await expect(page.getByText("Enter your name")).toBeVisible();
      await expectNoAccessibilityViolations(page, "name with error");

      await seedDriverAtStep(PHONES.driver, 2);
      await openOnboarding(page, PHONES.driver);
      await page.getByLabel("ZIP code", { exact: true }).fill(PLACES.dallas.zip);
      await expect(page.locator("[data-slot=launch-area-note]")).toBeVisible();
      await expectNoAccessibilityViolations(page, "ZIP outside the launch area");
      await page.getByLabel("ZIP code", { exact: true }).fill("99999");
      await expect(formAlert(page)).toBeVisible();
      await expectNoAccessibilityViolations(page, "ZIP not in the dataset");

      await seedDriverAtStep(PHONES.driver, 4);
      await openOnboarding(page, PHONES.driver);
      await nextButton(page).click();
      await expect(formAlert(page).first()).toBeVisible();
      await expectNoAccessibilityViolations(page, "CDL page with errors");
      await page.getByRole("radio", { name: /Class A/ }).click();
      await page.getByRole("button", { name: "3 to 5", exact: true }).click();
      await page
        .getByRole("group", { name: "Any moving violations in the last 3 years?" })
        .getByRole("button", { name: "None", exact: true })
        .click();
      await expectNoAccessibilityViolations(page, "CDL page answered");

      await seedDriverAtStep(PHONES.driver, 7);
      await openOnboarding(page, PHONES.driver);
      await nextButton(page).click();
      await expect(formAlert(page).first()).toBeVisible();
      await expectNoAccessibilityViolations(page, "cards with errors");
      await page
        .getByRole("group", { name: "Do you have an active TWIC card?" })
        .getByRole("button", { name: "Yes", exact: true })
        .click();
      await expectNoAccessibilityViolations(page, "cards answered");

      await seedDriverAtStep(PHONES.driver, 8);
      await openOnboarding(page, PHONES.driver);
      await page.getByRole("checkbox", { name: /^X\b/ }).click();
      await page.getByRole("radio", { name: /Automatic only/ }).click();
      await expectNoAccessibilityViolations(page, "letters with X and a transmission");

      await seedDriverAtStep(PHONES.driver, 10);
      await openOnboarding(page, PHONES.driver);
      await page.getByRole("button", { name: "Dry van", exact: true }).click();
      await expectNoAccessibilityViolations(page, "equipment selected");

      await seedDriverAtStep(PHONES.driver, 11);
      await openOnboarding(page, PHONES.driver);
      await nextButton(page, "Find local shifts").click();
      await expect(formAlert(page)).toBeVisible();
      await expectNoAccessibilityViolations(page, "consent with error");
      await page.getByRole("checkbox", { name: new RegExp(CONSENT_TEXT.slice(0, 30)) }).click();
      await expectNoAccessibilityViolations(page, "consent checked");
    });

    test("profile and documents", async ({ page }) => {
      // Opted out and outside the launch area: both notes and both badges on one page.
      const { driverId } = await seedDriverAtStep(PHONES.driver, 12, {
        sms_opted_out: true,
        sms_opted_out_at: new Date().toISOString(),
        ...PLACES.dallas,
      });
      await adminClient()
        .from("driver_documents")
        .insert({
          driver_id: driverId!,
          type: "cdl_front",
          storage_path: `${driverId}/00000000-0000-4000-8000-000000000001.jpg`,
          file_name: "cdl.jpg",
          mime_type: "image/jpeg",
          size_bytes: 1000,
        });

      await login(page, PHONES.driver);
      await expect(page).toHaveURL(/\/driver\/profile$/);
      await expect(page.getByText("Outside launch area")).toBeVisible();
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

    test("keyboard only: a mile can be answered with Tab, Space and Enter", async ({ page }) => {
      test.skip(test.info().project.name !== "desktop-chrome", "keyboard run once, on a desktop");
      await seedUser(PHONES.driver, "driver");
      await login(page, PHONES.driver);
      await expect(screenHeading(page)).toHaveText("About");

      // Skip link and Help come first; in dev React Strict Mode has already moved focus to
      // the sign title, so the number of stops before the field is not fixed.
      await tabTo(page, page.getByLabel("Full name"), 3);
      await page.keyboard.type("Pat Driver");

      await page.keyboard.press("Tab");
      await expect(page.getByLabel("ZIP code", { exact: true })).toBeFocused();
      await page.keyboard.type("75201");
      await expect(page.locator("[data-slot=zip-place]")).toContainText("Dallas, TX");

      await tabTo(page, page.getByRole("button", { name: "10 miles" }));
      await page.keyboard.press("Tab");
      await page.keyboard.press("Space");
      await expect(page.getByRole("button", { name: "25 miles" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await tabTo(page, nextButton(page));
      await page.keyboard.press("Enter");
      await expect(screenHeading(page)).toHaveText("CDL");
      await expect(screenHeading(page)).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(page.getByRole("radio", { name: /Class A/ })).toBeFocused();
      await page.keyboard.press("Space");
      await expect(page.getByRole("radio", { name: /Class A/ })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(page.locator(":focus-visible")).toHaveAttribute("role", "radio");
    });
  });
}
