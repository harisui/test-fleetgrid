import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The marketing site: each page renders with one H1, passes axe in light and dark, and the
 * contact form works end to end against the development mail stand-in (no RESEND_API_KEY:
 * the message is logged, not sent, and the page shows the success state).
 */

const PAGES = [
  { path: "/carriers", heading: "Fill open shifts with local drivers who already said yes to texts." },
  { path: "/contact", heading: "Contact FleetGrid." },
  { path: "/terms", heading: "Terms of Service" },
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/sms-terms", heading: "SMS Terms" },
];

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

test.describe("marketing pages", () => {
  for (const { path, heading } of PAGES) {
    test(`${path} renders with one H1 and passes axe in light and dark`, async ({ page, baseURL }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expectNoAccessibilityViolations(page, `${path} light`);
      // Dark through the cookie, applied before paint: no colour transition under axe.
      await page.context().addCookies([{ name: "fleetgrid-theme", value: "dark", url: baseURL! }]);
      await page.reload();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await expectNoAccessibilityViolations(page, `${path} dark`);
    });
  }

  test("the header, the launch strip and the footer are on every page, and the strip stays dismissed", async ({
    page,
  }) => {
    await page.goto("/contact");
    const banner = page.getByRole("banner");
    await expect(banner.getByRole("link", { name: "FleetGrid" })).toBeVisible();
    await expect(banner.getByRole("link", { name: "Log in" })).toBeVisible();
    const strip = page.getByRole("region", { name: "Launch area" });
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("NOW LAUNCHING IN THE HOUSTON AREA");
    await strip.getByRole("button", { name: "Dismiss" }).click();
    await expect(strip).toBeHidden();
    await page.reload();
    await expect(page.getByRole("region", { name: "Launch area" })).toBeHidden();

    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("FleetGrid is not an employer, staffing agency or freight broker.");
    await expect(footer).toContainText("Reply STOP to opt out, HELP for help.");
    // No phone number until the switches are on.
    await expect(footer).not.toContainText("869-2040");
    await expect(footer.getByRole("navigation", { name: "Legal" }).getByRole("link")).toHaveCount(3);
  });

  test("the phone menu opens with the keyboard, traps focus, closes on Escape and returns focus", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the menu button only shows on phones");
    await page.goto("/contact");
    const button = page.getByRole("button", { name: "Menu" });
    await button.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Menu" });
    await expect(dialog).toBeVisible();
    for (const name of ["For Carriers", "For Drivers", "FAQ", "Contact", "Log in"]) {
      const link = dialog.getByRole("link", { name });
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(56);
    }
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest("[role=dialog]") !== null)).toBe(
      true,
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
  });

  test("the contact form sends a message and thanks the sender by email", async ({ page }) => {
    // The time trap (under three seconds after the page rendered) is covered by the unit
    // tests; a dev server's first render can take longer than that on its own.
    await page.goto("/contact");
    await page.getByLabel("Name", { exact: false }).first().fill("Sample Carrier");
    await page.getByLabel("Email", { exact: false }).first().fill("sample@example.com");
    await page.getByText("Carrier", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "Carrier" })).toBeChecked();
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("We have three open shifts next week.");
    await page.waitForTimeout(3_200);
    await page.getByRole("button", { name: "Send message" }).click();
    const status = page.getByRole("status");
    await expect(status).toContainText("Thanks. Your message was sent.");
    await expect(status).toContainText("We will reply to sample@example.com.");
    await expect(page.getByRole("button", { name: "Send message" })).toHaveCount(0);
  });

  test("the carriers page answers a yard ZIP inside the area, outside it, and one it does not know", async ({
    page,
  }) => {
    await page.goto("/carriers");
    const zip = page.getByLabel("Your yard's ZIP code");
    const check = page.getByRole("button", { name: "Check" });

    await zip.fill("77506");
    await check.click();
    const inside = page.locator("[data-slot=zip-answer]");
    await expect(inside).toHaveAttribute("data-area", "inside");
    await expect(inside).toContainText("Pasadena, TX 77506. Good news, your yard is in the launch area.");
    await expect(inside.getByRole("link", { name: "Create your carrier account" })).toHaveAttribute(
      "href",
      "/login?role=carrier",
    );

    await zip.fill("75201");
    await check.click();
    await expect(page.locator("[data-slot=zip-answer]")).toHaveAttribute("data-area", "outside");
    await expect(page.getByRole("link", { name: "Join the waitlist" })).toBeVisible();

    await zip.fill("00000");
    await check.click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "We do not know that ZIP code.",
    );

    // The nav link that used to bounce: it stays on the carriers page, signed in or not.
    await page.goto("/");
    const inline = page.getByRole("banner").getByRole("link", { name: "For Carriers" });
    if (await inline.isVisible()) {
      await inline.click();
    } else {
      await page.getByRole("button", { name: "Menu" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "For Carriers" }).click();
    }
    await expect(page).toHaveURL(/\/carriers$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Fill open shifts");
  });

  test("an empty contact submit lists the errors at the top and focuses the list", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: "Send message" }).click();
    const summary = page.locator("[data-slot=contact-error-summary]");
    await expect(summary).toContainText("4 fields need attention");
    await expect(summary).toBeFocused();
    await summary.getByRole("link", { name: "Email" }).click();
    await expect(page.getByLabel("Email", { exact: false }).first()).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
