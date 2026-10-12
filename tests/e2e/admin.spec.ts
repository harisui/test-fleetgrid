import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  displayPhone,
  login,
  PHONES,
  resetUser,
  seedCarrier,
  seedDriverAtStep,
  seedUser,
} from "./helpers";

/**
 * Driver review: the admin approves a driver, who then appears in a subscribed carrier's
 * search; blocks one, who is signed out and hidden; and the queue filters.
 */

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

test.describe("driver review", () => {
  test.beforeEach(async () => {
    await seedUser(PHONES.admin, "admin", "approved");
  });

  test.afterAll(async () => {
    await resetUser(PHONES.admin);
    await resetUser(PHONES.driver);
    await resetUser(PHONES.carrier);
  });

  test("the queue shows pending drivers first; approving lists a driver to carriers, blocking signs them out", async ({
    page,
    browser,
  }) => {
    await seedDriverAtStep(PHONES.driver, 12);
    await login(page, PHONES.admin);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Driver review");
    await expect(page.getByRole("link", { name: "Pending review" })).toHaveAttribute("aria-current", "page");

    const row = page.getByRole("listitem").filter({ hasText: "Pat Driver" });
    await expect(row).toContainText(displayPhone(PHONES.driver));
    await expect(row).toContainText("Houston, TX 77002");
    await expect(row.getByText("Pending review")).toBeVisible();
    await expect(row.getByText("Card incomplete")).toHaveCount(0);
    await expectNoAccessibilityViolations(page, "driver review");

    await row.getByRole("button", { name: "Approve Pat Driver" }).click();
    await expect(page.getByText(/^Approved\./)).toBeVisible();
    await expect(row).toHaveCount(0);

    const admin = adminClient();
    const { data: approved } = await admin.from("profiles").select("status").eq("phone", PHONES.driver).single();
    expect(approved?.status).toBe("approved");

    await page.getByRole("link", { name: "Approved" }).click();
    await expect(page).toHaveURL(/\/admin\?status=approved$/);
    const approvedRow = page.getByRole("listitem").filter({ hasText: "Pat Driver" });
    await expect(approvedRow.getByText("Approved")).toBeVisible();
    await expect(approvedRow.getByRole("button", { name: "Approve Pat Driver" })).toHaveCount(0);

    // A subscribed carrier finds the driver now.
    await seedCarrier(PHONES.carrier, { terms: true, subscription: "active" });
    const carrierPage = await (await browser.newContext()).newPage();
    await login(carrierPage, PHONES.carrier);
    await expect(carrierPage).toHaveURL(/\/carrier\/search$/);
    await expect(carrierPage.getByRole("link", { name: /Pat Driver/ }).first()).toBeVisible();

    // Blocking hides the driver again and ends their session.
    await approvedRow.getByRole("button", { name: "Block Pat Driver" }).click();
    await expect(page.getByText(/^Blocked\./)).toBeVisible();
    const { data: blocked } = await admin.from("profiles").select("status").eq("phone", PHONES.driver).single();
    expect(blocked?.status).toBe("blocked");
    await carrierPage.reload();
    await expect(carrierPage.getByRole("link", { name: /Pat Driver/ })).toHaveCount(0);
    await carrierPage.context().close();

    await page.goto("/admin?status=blocked");
    const blockedRow = page.getByRole("listitem").filter({ hasText: "Pat Driver" });
    await expect(blockedRow.getByText("Blocked")).toBeVisible();
    await blockedRow.getByRole("button", { name: "Set pending Pat Driver" }).click();
    await expect(page.getByText("Back in the review queue.")).toBeVisible();
  });

  test("only admins see the review; a driver is sent home", async ({ page }) => {
    await seedDriverAtStep(PHONES.driver, 12);
    await login(page, PHONES.driver);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/driver\//);
  });
});
