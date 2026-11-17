import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, COMPLETE_STEP, login, PHONES, resetUser, seedDriverAtStep } from "./helpers";

/**
 * Out-of-state CDLs and the state of domicile (Milestone 6 feature 4; the attorney, 2026-11-14):
 * every driver answers his questions once before the other driver pages, the Texas questions show
 * only when they apply, and a flagged transfer waits for an admin's review.
 */

const UNANSWERED = { domicile_state: null, cdl_address_current: null, domicile_confirmed_at: null };

async function domicileOf(driverId: string) {
  const { data } = await adminClient()
    .from("drivers")
    .select("domicile_state, cdl_address_current, tx_domicile_within_30_days, cdl_transfer_applied, domicile_statement, domicile_confirmed_at")
    .eq("id", driverId)
    .single();
  return data;
}

const yes = (page: Page, question: RegExp) => page.getByRole("group", { name: question }).getByText("Yes", { exact: true });
const no = (page: Page, question: RegExp) => page.getByRole("group", { name: question }).getByText("No", { exact: true });

async function pickDomicile(page: Page, state: string) {
  await page.getByRole("combobox", { name: /state of domicile/ }).click();
  await page.getByRole("option", { name: state, exact: true }).click();
}

test.describe("domicile", () => {
  test.afterEach(async () => {
    await resetUser(PHONES.driver);
  });

  test("a driver who has not answered is asked once, before any other page; a Louisiana home needs no Texas questions", async ({ page }) => {
    const { driverId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { ...UNANSWERED, cdl_state: "LA" });
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/driver\/domicile$/);
    for (const path of ["/driver", "/driver/profile", "/driver/documents"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/driver\/domicile$/);
    }
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("nextjs-portal").analyze();
    expect(axe.violations.map((violation) => violation.id)).toEqual([]);

    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("Choose your state of domicile")).toBeVisible();
    await expect(page.getByText("Tick the box to confirm your answers")).toBeVisible();

    await pickDomicile(page, "Louisiana");
    await yes(page, /residential address on your CDL/).click();
    await expect(page.getByText(/Did you establish Texas domicile/)).toHaveCount(0);
    await page.getByRole("checkbox", { name: /I confirm this information is accurate/ }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page).toHaveURL(/\/driver$/);
    expect(await domicileOf(driverId!)).toMatchObject({
      domicile_state: "LA",
      cdl_address_current: true,
      tx_domicile_within_30_days: null,
      cdl_transfer_applied: null,
      domicile_statement: expect.stringMatching(/^I confirm this information is accurate/),
      domicile_confirmed_at: expect.any(String),
    });
  });

  test("a Texas home with an out-of-state CDL asks about the 30 days and the transfer; no transfer is flagged for review", async ({ page }) => {
    const { driverId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { ...UNANSWERED, cdl_state: "OK" });
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/driver\/domicile$/);
    await pickDomicile(page, "Texas");
    await no(page, /residential address on your CDL/).click();
    await no(page, /Did you establish Texas domicile within the last 30 days/).click();
    await no(page, /Have you transferred, or applied to transfer/).click();
    await page.getByRole("checkbox", { name: /I confirm this information is accurate/ }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page).toHaveURL(/\/driver$/);
    expect(await domicileOf(driverId!)).toMatchObject({
      domicile_state: "TX",
      cdl_address_current: false,
      tx_domicile_within_30_days: false,
      cdl_transfer_applied: false,
    });
    // The driver's page says what FleetGrid is reviewing; no shift offers until then.
    const { data: missing } = await adminClient().rpc("shift_ready_missing", { p_driver_id: driverId! });
    expect(missing).toContain("cdl_transfer_review");

    // The profile links back to the answers, which can change.
    await page.goto("/driver/profile");
    await expect(page.locator("[data-slot=domicile-summary]")).toContainText("State of domicile: TX");
    await page.getByRole("link", { name: "Update your answers" }).click();
    await expect(page).toHaveURL(/\/driver\/domicile$/);
    await yes(page, /Have you transferred, or applied to transfer/).click();
    await page.getByRole("checkbox", { name: /I confirm this information is accurate/ }).click();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page).toHaveURL(/\/driver$/);
    const { data: after } = await adminClient().rpc("shift_ready_missing", { p_driver_id: driverId! });
    expect(after).not.toContain("cdl_transfer_review");
  });
});
