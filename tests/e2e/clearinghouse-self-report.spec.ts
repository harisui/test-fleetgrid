import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  adminList,
  COMPLETE_STEP,
  login,
  nextButton,
  openOnboarding,
  PHONES,
  resetUser,
  screenHeading,
  seedDriverAtStep,
  seedUser,
} from "./helpers";

/**
 * The self-reported Clearinghouse and SAP answer (client brief of 2026-10-29): optional and
 * skippable at sign-up, withdrawn and given again from the profile, shown to the admin with a
 * neutral badge and a filter, and never anything a carrier can read.
 */

const BADGE = "Self-reported: No Clearinghouse / No SAP";
const box = (page: Page) => page.getByRole("checkbox", { name: /I confirm I have no unresolved violations/ });

async function expectNoAccessibilityViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .exclude("nextjs-portal")
    .analyze();
  expect(
    results.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.length })),
    label,
  ).toEqual([]);
}

async function selfReportRows(driverId: string) {
  const { data } = await adminClient().from("driver_clearinghouse_self_reports").select("confirmed_at").eq("driver_id", driverId);
  return data ?? [];
}

test.describe("Clearinghouse and SAP self-report", () => {
  test.afterAll(async () => {
    await resetUser(PHONES.driver);
  });

  test("Skip saves nothing and the sign-up goes on; axe passes on the page in light and dark", async ({ page }) => {
    const { driverId } = await seedDriverAtStep(PHONES.driver, 5);
    await openOnboarding(page, PHONES.driver);
    await expect(screenHeading(page)).toHaveText("Clearinghouse and SAP");
    await expect(box(page)).not.toBeChecked();
    await expectNoAccessibilityViolations(page, "clearinghouse page, light");
    // Dark the way a visitor gets it: the theme cookie before the page loads, no transitions.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.context().addCookies([{ name: "fleetgrid-theme", value: "dark", url: "http://localhost:3000" }]);
    await page.reload();
    await expect(screenHeading(page)).toHaveText("Clearinghouse and SAP");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectNoAccessibilityViolations(page, "clearinghouse page, dark");
    await page.context().addCookies([{ name: "fleetgrid-theme", value: "light", url: "http://localhost:3000" }]);
    await page.reload();

    // Ticked, then Skip: still nothing stored.
    await box(page).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(screenHeading(page)).toHaveText("Cards");
    expect(await selfReportRows(driverId!)).toEqual([]);
    const { data } = await adminClient().from("drivers").select("onboarding_step, card_completed").eq("id", driverId!).single();
    expect(data).toEqual({ onboarding_step: 6, card_completed: false });
  });

  test("Continue with the tick saves the time; the profile withdraws it and gives it again with a new time", async ({ page }) => {
    const { driverId } = await seedDriverAtStep(PHONES.driver, 5);
    await openOnboarding(page, PHONES.driver);
    await box(page).click();
    await nextButton(page, "Continue").click();
    await expect(screenHeading(page)).toHaveText("Cards");
    const [first] = await selfReportRows(driverId!);
    expect(first).toBeDefined();

    // Finish the card, then the profile: the box is ticked, with the date, apart from the account question.
    await adminClient().from("drivers").update({
      twic_active: true, medical_card_active: true, endorsements: ["H"], transmission: "manual_ok",
      equipment_types: ["dry_van"], onboarding_step: COMPLETE_STEP, card_completed: true,
    }).eq("id", driverId!);
    await page.goto("/driver/profile");
    const section = page.locator("[data-slot=clearinghouse-self-report]");
    await expect(section.getByRole("heading", { name: "Clearinghouse and SAP" })).toBeVisible();
    await expect(box(page)).toBeChecked();
    await expect(section.locator("[data-slot=clearinghouse-confirmed-at]")).toContainText("Confirmed on");
    await expect(page.getByText("Registered in the Clearinghouse")).toBeVisible();
    await expectNoAccessibilityViolations(page, "profile with the self-report");

    // Untick: the row and its date are gone.
    await box(page).click();
    await expect(page.getByText("Removed. Your answer and its date are deleted.")).toBeVisible();
    await expect(box(page)).not.toBeChecked();
    expect(await selfReportRows(driverId!)).toEqual([]);

    // Tick again: a new time.
    await box(page).click();
    await expect(section.locator("[data-slot=clearinghouse-confirmed-at]")).toBeVisible();
    const [again] = await selfReportRows(driverId!);
    expect(Date.parse(again.confirmed_at)).toBeGreaterThan(Date.parse(first.confirmed_at));
  });

  test("the admin sees the neutral badge, filters by it, and reads the note; never the word Clean", async ({ page }) => {
    const { driverId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP);
    await adminClient().from("driver_clearinghouse_self_reports").insert({ driver_id: driverId! });
    await seedUser(PHONES.admin, "admin", "approved");
    await login(page, PHONES.admin);

    await page.goto("/admin/drivers?selfReport=yes");
    await expect(page.getByRole("link", { name: /^Clearinghouse and SAP: Self-reported yes/ })).toBeVisible();
    const list = adminList(page, "Drivers");
    await expect(list.getByRole("link", { name: /^Pat Driver/ })).toHaveCount(1);
    await expect(list.getByText(BADGE)).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/\bclean\b/i);
    await expectNoAccessibilityViolations(page, "drivers list with the badge");

    await page.goto("/admin/drivers?selfReport=none");
    await expect(adminList(page, "Drivers").getByRole("link", { name: /^Pat Driver/ })).toHaveCount(0);

    await page.goto(`/admin/drivers?open=${driverId}`);
    const answer = page.getByRole("dialog", { name: "Pat Driver" }).locator("[data-slot=self-report]");
    await expect(answer).toContainText(BADGE);
    await expect(answer).toContainText("Confirmed on");
    await expect(answer).toContainText("Self-reported by the driver. Carriers must run their own Clearinghouse query.");
    await page.waitForTimeout(300);
    await expectNoAccessibilityViolations(page, "driver sheet with the self-report");
  });
});
