import { createHash, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  acceptLeadTerms,
  adminClient,
  COMPLETE_STEP,
  loginAdmin,
  nextButton,
  PHONES,
  PLACES,
  resetUser,
  screenHeading,
  seedDriverAtStep,
  seedUser,
  signUp,
  TOS_VERSION,
} from "./helpers";

/**
 * Milestone 6, part 1: the driver accepts the Terms at sign-up, and through a one-time link
 * that records nothing when opened and works once. The archive and the paused offers are
 * covered by pgTAP 031: a version that needs everyone again cannot be published here, because
 * the archive is append-only and it would gate every local driver for good.
 */

const STATEMENT = "I have read and agree to the FleetGrid Terms of Service and Privacy Policy.";
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

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

async function acceptancesOf(userId: string) {
  const { data } = await adminClient()
    .from("tos_acceptances")
    .select("version, method, statement, user_agent, terms_link_id")
    .eq("profile_id", userId);
  return data ?? [];
}

/** A one-time link for the driver, made the way the admin's send makes it. */
async function issueLink(userId: string, expiresInMs = 14 * 86_400_000): Promise<string> {
  const token = randomBytes(16).toString("base64url");
  const { error } = await adminClient()
    .from("driver_terms_links")
    .insert({ profile_id: userId, version: TOS_VERSION, token_hash: sha256(token), expires_at: new Date(Date.now() + expiresInMs).toISOString() });
  if (error) throw new Error(`issueLink failed: ${error.message}`);
  return token;
}

test.describe("driver Terms", () => {
  test.afterEach(async () => {
    await resetUser(PHONES.driver);
  });

  test("the sign-up's first screen needs the box, and records the version and the words with the card", async ({ page }) => {
    await signUp(page, PHONES.driver, "driver");
    await page.getByLabel("Full name").fill("Terry Terms");
    await page.getByLabel("ZIP code", { exact: true }).fill(PLACES.houston.zip);
    await expect(page.locator("[data-slot=zip-place]")).toContainText("Houston, TX");
    await page.getByRole("radio", { name: /Class A/ }).click();
    const box = page.getByRole("checkbox", { name: /I have read and agree to the FleetGrid Terms/ });
    await expect(box).not.toBeChecked();

    await nextButton(page, "Save and continue").click();
    await expect(page.getByText("Tick the box to accept the Terms of Service")).toBeVisible();
    await expect(screenHeading(page)).toHaveText("About");

    await acceptLeadTerms(page);
    await nextButton(page, "Save and continue").click();
    await expect(screenHeading(page)).toHaveText("Driving");

    const { data: profile } = await adminClient().from("profiles").select("id").eq("phone", PHONES.driver).single();
    const rows = await acceptancesOf(profile!.id);
    expect(rows).toEqual([
      { version: TOS_VERSION, method: "signup", statement: STATEMENT, user_agent: expect.any(String), terms_link_id: null },
    ]);
  });

  test("the link page shows the Terms, records nothing on opening, and accepts once", async ({ page }) => {
    const { userId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP);
    const token = await issueLink(userId);

    await page.goto(`/t/${token}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Our Terms of Service changed");
    await expect(page.getByRole("region", { name: "Terms of Service, full text" })).toContainText("1. What is FleetGrid?");
    await expect(page.getByText(`Version ${TOS_VERSION}`)).toBeVisible();
    expect(await acceptancesOf(userId)).toEqual([]);
    await expectNoAccessibilityViolations(page, "link page");

    await page.getByRole("button", { name: "Accept the Terms" }).click();
    await expect(page.getByText("Tick the box to accept the Terms of Service")).toBeVisible();
    expect(await acceptancesOf(userId)).toEqual([]);

    await page.getByRole("checkbox", { name: /I have read and agree to the FleetGrid Terms/ }).click();
    await page.getByRole("button", { name: "Accept the Terms" }).click();
    await expect(page.getByRole("status")).toContainText("You accepted the Terms of Service");
    expect(await acceptancesOf(userId)).toEqual([
      { version: TOS_VERSION, method: "link", statement: STATEMENT, user_agent: expect.any(String), terms_link_id: expect.any(String) },
    ]);

    await page.reload();
    await expect(page.getByRole("status")).toContainText("This link was used already");
    await expect(page.getByRole("button", { name: "Accept the Terms" })).toHaveCount(0);
  });

  test("an expired or unknown link says so and offers sign-in, and nobody signs in through it", async ({ page }) => {
    const { userId } = await seedDriverAtStep(PHONES.driver, COMPLETE_STEP);
    const token = await issueLink(userId, 1_000);
    await page.waitForTimeout(1_500);

    await page.goto(`/t/${token}`);
    await expect(page.getByRole("status")).toContainText("This link has expired.");
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("button", { name: "Accept the Terms" })).toHaveCount(0);

    await page.goto("/t/not-a-real-token");
    await expect(page.getByRole("status")).toContainText("This link does not work.");
    // The link is not a sign-in: the driver pages still ask for one.
    await page.goto("/driver");
    await expect(page).toHaveURL(/\/login$/);
    expect(await acceptancesOf(userId)).toEqual([]);
  });

  test("the page is kept out of search engines", async ({ page }) => {
    await page.goto("/t/not-a-real-token");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("admin Terms page", () => {
  test("shows the current version, and that no version needs drivers to accept it again", async ({ page }) => {
    await seedUser(PHONES.admin, "admin", "approved");
    await loginAdmin(page);
    await page.getByRole("link", { name: "Terms" }).first().click();
    await expect(page).toHaveURL(/\/admin\/terms$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms");
    await expect(page.locator("[data-slot=stat-tile]").first()).toContainText(TOS_VERSION);
    await expect(page.getByText("No version needs drivers to accept it again.")).toBeVisible();
    await expectNoAccessibilityViolations(page, "admin terms");
  });
});
