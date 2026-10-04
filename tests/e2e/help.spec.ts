import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { MILES } from "../../src/lib/onboarding/steps";
import { isGrouped, openOnboarding, PHONES, resetUser, seedDriverAtStep } from "./helpers";

/**
 * The Help sheet: a bottom sheet on phones, a popover on wider screens, with the sign-in
 * help, the stage guide and the support block. Opens and closes by touch and by keyboard,
 * and passes axe in light and dark.
 */

const helpButton = (page: Page) => page.getByRole("button", { name: "Help" });
const helpSurface = (page: Page) => page.getByRole("dialog", { name: "Help" });

async function expectHelpContent(page: Page) {
  const surface = helpSurface(page);
  await expect(surface).toBeVisible();
  await expect(surface.getByRole("heading", { name: "How to sign in" })).toBeVisible();
  await expect(surface.getByRole("heading", { name: "Need a new code?" })).toBeVisible();
  await expect(surface.getByRole("heading", { name: "What the stages mean" })).toBeVisible();
  const stages = surface.getByRole("list", { name: "Stages" }).getByRole("listitem");
  await expect(stages).toHaveCount(MILES.length);
  for (const mile of MILES) {
    await expect(stages.filter({ hasText: new RegExp(`^${mile.label}`) })).toBeVisible();
  }
  await expect(surface.getByRole("heading", { name: "Support" })).toBeVisible();
  // SUPPORT_EMAIL and SUPPORT_PHONE are empty locally, so the placeholder shows.
  await expect(surface.locator("[data-slot=support-contact]")).toBeVisible();
  await expect(surface.getByRole("link", { name: "SMS Terms" })).toHaveAttribute(
    "href",
    "/sms-terms",
  );
}

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

test.afterAll(async () => {
  await resetUser(PHONES.driver);
});

test("on the login screen: opens, shows the help, closes, in the layout for this viewport", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(helpSurface(page)).toHaveCount(0);
  await helpButton(page).click();
  await expectHelpContent(page);

  const surface = helpSurface(page);
  if (isGrouped(page)) {
    await expect(surface).toHaveAttribute("data-slot", "help-popover");
    // Anchored under the button, not pinned to the bottom edge.
    const button = await helpButton(page).boundingBox();
    const box = await surface.boundingBox();
    expect(box!.y).toBeGreaterThan(button!.y + button!.height);
    await expect(page.locator("[data-slot=sheet-overlay]")).toHaveCount(0);
    await helpButton(page).click();
  } else {
    await expect(surface).toHaveAttribute("data-slot", "help-sheet");
    // Pinned to the bottom edge of the phone.
    const box = await surface.boundingBox();
    const viewport = page.viewportSize()!;
    expect(Math.round(box!.y + box!.height)).toBe(viewport.height);
    expect(Math.round(box!.width)).toBe(viewport.width);
    await surface.getByRole("button", { name: "Close" }).click();
  }
  await expect(helpSurface(page)).toHaveCount(0);
});

test("on the onboarding: keyboard only, Escape closes and focus returns to Help", async ({
  page,
}) => {
  await seedDriverAtStep(PHONES.driver, 4);
  await openOnboarding(page, PHONES.driver);
  await helpButton(page).focus();
  await page.keyboard.press("Enter");
  await expectHelpContent(page);
  await page.keyboard.press("Escape");
  await expect(helpSurface(page)).toHaveCount(0);
  await expect(helpButton(page)).toBeFocused();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`passes axe when open (${colorScheme})`, async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: "fleetgrid-theme", value: colorScheme, url: "http://localhost:3000" }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");
    await helpButton(page).click();
    await expectHelpContent(page);
    await expectNoAccessibilityViolations(page, `help open on login, ${colorScheme}`);
  });
}
