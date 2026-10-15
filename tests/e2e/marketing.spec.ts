import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The marketing site: each page renders with one H1, passes axe in light and dark, and the
 * contact form works end to end against the development mail stand-in (no RESEND_API_KEY:
 * the message is logged, not sent, and the page shows the success state).
 */

const PAGES = [
  { path: "/", heading: "Local CDL drivers. Shifts filled by text." },
  { path: "/carriers", heading: "Fill open shifts with local drivers who already said yes to texts." },
  { path: "/drivers", heading: "Local shifts near home. Sent to your phone." },
  { path: "/faq", heading: "Questions and answers" },
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
      // Reduced motion: every section is visible at once, so axe sees the whole page, not
      // the faded-out start of the blocks below the fold.
      await page.emulateMedia({ reducedMotion: "reduce" });
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

  test("a FAQ link from the drivers page opens that answer, and the accordion works by keyboard", async ({
    page,
  }) => {
    await page.goto("/drivers");
    await page.getByRole("link", { name: "Is FleetGrid really free for drivers?" }).click();
    await expect(page).toHaveURL(/\/faq#driver-free$/);
    const opened = page.getByRole("button", { name: "Is FleetGrid really free for drivers?" });
    await expect(opened).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Yes, always. Carriers pay the subscription.")).toBeVisible();

    const next = page.getByRole("button", { name: "Do I need a CDL to sign up?" });
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(next).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Enter");
    await expect(next).toHaveAttribute("aria-expanded", "false");
    expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(56);
  });

  test("under reduced motion the home page shows every block and the hero's final frame at once", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/js-motion/);
    const hero = page.locator("[data-slot=hero]");
    await expect(hero.locator("[data-slot=hero-bubble][data-bubble='3']")).toBeVisible();
    await expect(hero.locator("[data-slot=hero-badge]")).toBeVisible();
    await expect(hero.locator("[data-slot=hero-badge]")).toContainText("Shift filled");
    const styles = await page.evaluate(() => {
      const of = (selector: string) => {
        const element = document.querySelector(selector)!;
        const style = getComputedStyle(element);
        return { opacity: style.opacity, transition: style.transitionDuration, animation: style.animationDuration };
      };
      return {
        bubble: of("[data-slot=hero-bubble][data-bubble='3']"),
        reveal: of("[data-reveal]"),
        fill: of("[data-slot=hero-fill]"),
        road: of("[data-slot=road-world]"),
      };
    });
    expect(styles.bubble.opacity).toBe("1");
    expect(styles.reveal.opacity).toBe("1");
    expect(styles.reveal.transition).toBe("0s");
    expect(styles.fill.animation).toBe("0s");
    // The highway stands still on its drawn frame: four trucks, no live movers.
    expect(styles.road.animation).toBe("0s");
    await expect(hero.locator("[data-slot=road-static] [data-slot=road-truck]")).toHaveCount(5);
    await expect(hero.locator("[data-slot=road-static]")).toBeVisible();
    await expect(hero.locator("[data-slot=road-mover]")).toHaveCount(0);
    // Every reveal block is visible without scrolling anywhere.
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll("[data-reveal]")].filter((el) => getComputedStyle(el).opacity !== "1").length,
    );
    expect(hidden).toBe(0);
  });

  test("the hero's road rolls and its phone thread loops with motion on, and the page does not shift", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      const shifts: number[] = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) shifts.push(shift.value);
        }
      }).observe({ type: "layout-shift", buffered: true });
      (window as unknown as { __shifts: number[] }).__shifts = shifts;
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/js-motion/);
    const hero = page.locator("[data-slot=hero]");
    // On a phone the scene sits under the hero text, below the fold: it plays once scrolled to.
    await hero.scrollIntoViewIfNeeded();
    await expect(hero).toHaveClass(/is-playing/, { timeout: 5_000 });
    // The thread starts empty and fills in order over the nine-second loop: the offer, the
    // reply, the confirmation, then the badge; every part is on the same infinite cycle.
    const opacity = (selector: string) => hero.locator(selector).evaluate((el) => getComputedStyle(el).opacity);
    expect(await opacity("[data-slot=hero-bubble][data-bubble='3']")).toBe("0");
    await expect.poll(() => opacity("[data-slot=hero-bubble][data-bubble='1']"), { timeout: 3_000 }).toBe("1");
    expect(await opacity("[data-slot=hero-bubble][data-bubble='3']")).toBe("0");
    await expect.poll(() => opacity("[data-slot=hero-bubble][data-bubble='3']"), { timeout: 6_000 }).toBe("1");
    await expect.poll(() => opacity("[data-slot=hero-badge]"), { timeout: 4_000 }).toBe("1");
    const cycle = await hero.locator("[data-slot=hero-bubble][data-bubble='1']").evaluate((el) => {
      const style = getComputedStyle(el);
      return { count: style.animationIterationCount, duration: style.animationDuration };
    });
    expect(cycle).toEqual({ count: "infinite", duration: "9s" });
    expect(
      await hero.locator("[data-slot=hero-badge]").evaluate((el) => getComputedStyle(el).animationDuration),
    ).toBe("9s");
    // The first round is the exact Twilio sample; the next round is a new shift with its own code.
    const reply = hero.locator("[data-slot=hero-bubble][data-bubble='2']");
    const offer = hero.locator("[data-slot=hero-bubble][data-bubble='1']");
    await expect(reply).toHaveText("YES 4821");
    await expect(reply).not.toHaveText("YES 4821", { timeout: 9_000 });
    const code = (await reply.textContent())!.replace("YES ", "");
    expect(code).toMatch(/^\d{4}$/);
    await expect(offer).toContainText(`Reply YES ${code} to claim.`);
    await expect(offer).toContainText("FleetGrid: CDL-A driver needed, Pasadena TX, Tue Oct 14 6:00 AM.");
    // The highway rolls and trucks drive by: the ground is animated, the still frame is
    // hidden, and the live layer has traffic from the first frame on.
    const road = hero.locator("[data-slot=hero-road]");
    expect(await road.locator("[data-slot=road-world]").evaluate((el) => getComputedStyle(el).animationName)).toBe(
      "road-scroll",
    );
    await expect(road.locator("[data-slot=road-static]")).toBeHidden();
    await expect(road.locator("[data-slot=road-mover][data-kind=truck]").first()).toBeAttached();
    expect(await road.locator("[data-slot=road-mover]").count()).toBeGreaterThanOrEqual(3);
    const before = await road.locator("[data-slot=road-mover]").first().evaluate((el) => getComputedStyle(el).transform);
    await page.waitForTimeout(600);
    const after = await road.locator("[data-slot=road-mover]").first().evaluate((el) => getComputedStyle(el).transform);
    expect(after).not.toBe(before);
    const cls = await page.evaluate(() =>
      (window as unknown as { __shifts: number[] }).__shifts.reduce((sum, value) => sum + value, 0),
    );
    expect(cls).toBeLessThan(0.01);
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
