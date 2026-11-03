import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { adminClient, COMPLETE_STEP, login, nextButton, PHONES, PLACES, resetUser, seedDriverAtStep, seedUser, signUp } from "./helpers";

/**
 * The CDL state (CR-5, part 1): asked on the lead with Texas picked to start, asked once of a
 * card saved before it existed (before any other driver page, no skip), editable on the
 * profile, and shown to the admin with the "Not Texas CDL" badge and filter.
 */

async function expectNoAccessibilityViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .exclude("nextjs-portal")
    .analyze();
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")) })),
    label,
  ).toEqual([]);
}

async function cdlStateOf(phone: string): Promise<string | null> {
  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("phone", phone).single();
  const { data } = await admin.from("drivers").select("cdl_state").eq("profile_id", profile!.id).single();
  return data?.cdl_state ?? null;
}

/** Picks a state in the theme dropdown, by its name. */
async function pickState(page: Page, label: string | RegExp, state: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: state, exact: true }).click();
}

test.describe("CDL state", () => {
  test.afterAll(async () => {
    await resetUser(PHONES.driver);
  });

  test("the lead asks it next to the class, Texas to start, and saves the choice", async ({ page }) => {
    await signUp(page, PHONES.driver, "driver");
    await expect(page).toHaveURL(/\/driver\/onboarding$/);
    await expect(page.getByRole("combobox", { name: "CDL state" })).toHaveText(/Texas/);
    await page.getByLabel("Full name").fill("Okie Driver");
    await page.getByLabel("ZIP code", { exact: true }).fill(PLACES.houston.zip);
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Houston, TX");
    await page.getByRole("radio", { name: /Class A/ }).click();
    await pickState(page, "CDL state", "Oklahoma");
    await nextButton(page, "Save and continue").click();
    await expect(page.getByText("How far will you travel for work?")).toBeVisible();
    expect(await cdlStateOf(PHONES.driver)).toBe("OK");
  });

  test("a card saved before CR-5 answers the question once, before any other page, with no skip", async ({ page }) => {
    await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { cdl_state: null });
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/driver\/cdl-state$/);
    await expect(page.getByRole("heading", { level: 1, name: "Which state issued your CDL?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Profile" })).toHaveCount(0);
    for (const path of ["/driver", "/driver/profile", "/driver/documents", "/driver/onboarding"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/driver\/cdl-state$/);
    }
    await expectNoAccessibilityViolations(page, "cdl-state light");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page).toHaveURL(/\/driver$/);
    expect(await cdlStateOf(PHONES.driver)).toBe("TX");
    await page.goto("/driver/cdl-state");
    await expect(page).toHaveURL(/\/driver$/);
  });

  test("the question page passes axe in dark mode", async ({ page }) => {
    await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { cdl_state: null });
    await page.context().addCookies([{ name: "fleetgrid-theme", value: "dark", url: "http://localhost:3000" }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/driver\/cdl-state$/);
    await expectNoAccessibilityViolations(page, "cdl-state dark");
  });

  test("the profile changes it", async ({ page }) => {
    await seedDriverAtStep(PHONES.driver, COMPLETE_STEP);
    await login(page, PHONES.driver);
    await page.goto("/driver/profile");
    await pickState(page, "CDL state", "Louisiana");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();
    expect(await cdlStateOf(PHONES.driver)).toBe("LA");
  });

  test("the admin sees the state, the Not Texas CDL badge and the filter", async ({ page }) => {
    const { driverId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP, { cdl_state: "LA", full_name: "Lou Isiana" });
    await seedUser(PHONES.admin, "admin", "approved");
    await login(page, PHONES.admin);
    await page.goto("/admin/drivers?cdl=other");
    const list = page.getByRole("table", { name: "Drivers" }).or(page.getByRole("list", { name: "Drivers" })).filter({ visible: true });
    await expect(list).toContainText("Lou Isiana");
    await expect(list).toContainText("Not Texas CDL");
    await page.goto("/admin/drivers?cdl=tx");
    await expect(page.getByText("Lou Isiana")).toHaveCount(0);
    await page.goto(`/admin/drivers?open=${driverId}`);
    const sheet = page.getByRole("dialog", { name: "Lou Isiana" });
    await expect(sheet).toContainText("Not Texas CDL");
    await expect(sheet).toContainText("CDL state");
  });
});
