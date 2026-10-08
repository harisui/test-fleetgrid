import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { SMS_CONSENT_TEXT } from "../../src/lib/constants";
import { stepNumber } from "../../src/lib/onboarding/steps";
import {
  expectScreen,
  login,
  nextButton,
  PHONES,
  resetUser,
  seedDriverAtStep,
} from "../e2e/helpers";

/**
 * Twilio opt-in proof: the phone number screen and the SMS consent screen of the driver
 * sign-up, photographed at phone size in the light theme. Writes screenshots/opt-in/.
 * Run with `pnpm screenshots:opt-in` against the local dev server.
 */

const OUT = resolve("screenshots", "opt-in");
const PHONE = { width: 390, height: 844 };
const CONSENT_QUESTION = "Can we text you about shifts?";
const CONSENT_STEP = stepNumber("consent");

test.use({
  viewport: PHONE,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: "light",
});

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  await resetUser(PHONES.driver);
});

test.beforeEach(async ({ page }) => {
  await page
    .context()
    .addCookies([{ name: "fleetgrid-theme", value: "light", url: "http://localhost:3000" }]);
});

/** Fonts loaded, no dev-tools badge, no focus ring: the screen as a person sees it. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await page.waitForTimeout(150);
}

test("phone.png: the mobile number screen, field empty", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "What is your mobile number?" })).toBeVisible();
  // ENABLE_TEST_LOGIN may start the field filled; the proof shows it empty. Hydration can
  // put the prefill back after an early clear, so clear once the page is idle and check again.
  await page.waitForLoadState("networkidle");
  const field = page.getByLabel("Mobile number");
  await field.fill("");
  await page.waitForTimeout(500);
  await field.fill("");
  await expect(field).toHaveValue("");
  await page.waitForTimeout(500);
  await expect(field).toHaveValue("");
  await expect(page.getByText(/555-01|123456/)).toHaveCount(0);
  await settle(page);
  await page.screenshot({ path: resolve(OUT, "phone.png") });
});

test("consent.png and consent-checked.png: the SMS consent screen", async ({ page }) => {
  await seedDriverAtStep(PHONES.driver, CONSENT_STEP);
  await login(page, PHONES.driver);
  await expect(page).toHaveURL(/\/driver\/onboarding$/);
  await expectScreen(page, CONSENT_QUESTION);

  const checkbox = page.getByRole("checkbox");
  await expect(checkbox).toHaveAttribute("aria-checked", "false");
  // The words on screen are the words stored with the consent, character for character.
  const consentText = page.getByText(SMS_CONSENT_TEXT, { exact: true });
  await expect(consentText).toBeVisible();
  await expect(consentText).toBeInViewport({ ratio: 1 });
  await expect(nextButton(page, "Agree and finish")).toBeVisible();
  await settle(page);
  await page.screenshot({ path: resolve(OUT, "consent.png") });

  await checkbox.click();
  await expect(checkbox).toHaveAttribute("aria-checked", "true");
  await expect(consentText).toBeInViewport({ ratio: 1 });
  await expect(nextButton(page, "Agree and finish")).toBeVisible();
  await settle(page);
  await page.screenshot({ path: resolve(OUT, "consent-checked.png") });
});
