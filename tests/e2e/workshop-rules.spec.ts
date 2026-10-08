import { expect, test, type Page } from "@playwright/test";
import { progressFor, STEPS } from "../../src/lib/onboarding/steps";
import {
  expectScreen,
  formAlert,
  isGrouped,
  login,
  openOnboarding,
  PHONES,
  resetUser,
  seedDriverAtStep,
} from "./helpers";

/**
 * The Workshop design contract, checked on the live app in both layouts (one question per
 * screen on phones, a mile per page on wider screens):
 * - orange (--primary) appears only as the primary button fill, the progress fill, the sign
 *   stripe and the check badge;
 * - a selected option card uses the graphite selection border and tint, carries
 *   aria-checked="true" and shows the check badge;
 * - no error is visible when a screen first loads;
 * - onboarding routes render no app navigation, log out or theme toggle;
 * - every screen's eyebrow, stage highlight and truck position come from steps.ts;
 * - every control is at least 48px, the main action 56px;
 * - reduced motion turns the transitions off.
 */

/** "#b84a00" -> "rgb(184, 74, 0)", the form getComputedStyle reports. */
async function tokenRgb(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const hex = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const value = parseInt(hex.slice(1), 16);
    return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
  }, token);
}

const PRIMARY_FILL_ALLOWED =
  "[data-slot=button][data-variant=primary], [data-slot=check-badge], [data-slot=lane-fill], .bg-progress-fill";

async function orangeViolations(page: Page): Promise<string[]> {
  const primary = await tokenRgb(page, "--primary");
  return page.evaluate(
    ({ primary, allowed }) => {
      const describe = (el: Element, what: string) =>
        `${what}: <${el.tagName.toLowerCase()} class="${el.getAttribute("class") ?? ""}">`;
      const found: string[] = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest("nextjs-portal")) continue;
        const style = getComputedStyle(el);
        if (style.backgroundColor === primary && !el.matches(allowed)) {
          found.push(describe(el, "background"));
        }
        if (style.color === primary) found.push(describe(el, "text"));
        for (const side of ["top", "right", "bottom", "left"]) {
          const width = style.getPropertyValue(`border-${side}-width`);
          const color = style.getPropertyValue(`border-${side}-color`);
          if (color === primary && width !== "0px" && !el.matches("[data-slot=sign-header]")) {
            found.push(describe(el, `border-${side}`));
          }
        }
        if (style.outlineColor === primary && style.outlineStyle !== "none") {
          found.push(describe(el, "outline"));
        }
      }
      return found;
    },
    { primary, allowed: PRIMARY_FILL_ALLOWED },
  );
}

async function openStep(page: Page, stepNumber: number, overrides?: Record<string, unknown>) {
  await seedDriverAtStep(PHONES.driver, stepNumber, overrides);
  await openOnboarding(page, PHONES.driver);
  await expectScreen(page, STEPS[stepNumber - 1].question);
}

const cardStyle = (el: Element) => {
  const style = getComputedStyle(el);
  return {
    border: style.borderTopColor,
    background: style.backgroundColor,
    shadow: style.boxShadow,
  };
};

test.describe("Workshop rules", () => {
  test.afterAll(async () => {
    await resetUser(PHONES.driver);
  });

  for (const stepNumber of [1, 4, 5, 7, 10, 11, 13, 14, 15, 17, 18]) {
    test(`orange is only the primary fill, progress fill, sign stripe and check badge on step ${stepNumber}`, async ({
      page,
    }) => {
      await openStep(page, stepNumber);
      expect(await orangeViolations(page)).toEqual([]);
      if (stepNumber === 4) {
        const card = page.getByRole("checkbox", { name: /CDL driver/ });
        await card.click();
        await expect(card).toHaveAttribute("aria-checked", "true");
        expect(await orangeViolations(page)).toEqual([]);
      }
    });
  }

  test("orange is never used on the login, code and role screens either", async ({ page }) => {
    await page.goto("/login");
    expect(await orangeViolations(page)).toEqual([]);
    await resetUser(PHONES.driver);
    await login(page, PHONES.driver);
    await expect(page).toHaveURL(/\/choose-role/);
    const card = page.getByRole("radio", { name: /I drive or work trucks/ });
    await card.click();
    await expect(card).toHaveAttribute("aria-checked", "true");
    expect(await orangeViolations(page)).toEqual([]);
  });

  test("a selected option card uses the graphite selection border and tint, aria-checked and the badge", async ({
    page,
  }) => {
    await openStep(page, 4);
    const selection = await tokenRgb(page, "--selection");
    const tint = await tokenRgb(page, "--selection-tint");
    const strong = await tokenRgb(page, "--border-strong");
    const card = page.getByRole("checkbox", { name: /Mechanic/ });

    await expect(card).toHaveAttribute("aria-checked", "false");
    await expect(card.locator("[data-slot=check-badge]")).toHaveCount(0);
    const before = await card.evaluate(cardStyle);
    expect(before.border).toBe(strong);
    expect(before.background).not.toBe(tint);

    await card.click();
    await expect(card).toHaveAttribute("aria-checked", "true");
    await expect(card.locator("[data-slot=check-badge]")).toBeVisible();
    // The colors change over a 160ms transition, so these retry until it has settled.
    await expect(card).toHaveCSS("border-top-color", selection);
    await expect(card).toHaveCSS("background-color", tint);
    await expect.poll(async () => (await card.evaluate(cardStyle)).shadow).toContain(selection);
    expect(await orangeViolations(page)).toEqual([]);
  });

  for (const step of STEPS) {
    const stepNumber = STEPS.indexOf(step) + 1;
    test(`no error is visible when ${step.id} first loads`, async ({ page }) => {
      await openStep(page, stepNumber);
      await expect(formAlert(page)).toHaveCount(0);
      await expect(page.locator("[aria-invalid='true']")).toHaveCount(0);
    });
  }

  test("onboarding routes render no app navigation, log out or theme toggle", async ({ page }) => {
    await openStep(page, 4);
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Toggle dark mode" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Profile" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Documents" })).toHaveCount(0);
    // The page title is "Set up your profile"; the route announcer may repeat it for screen
    // readers after a client-side redirect. Only the visible chrome must not show it.
    await expect(page.getByRole("banner").getByText("Set up your profile")).toHaveCount(0);
    await expect(page.getByRole("main").getByText("Set up your profile")).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("img", { name: "FleetGrid" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Help" })).toBeVisible();
  });

  for (const stepNumber of [1, 5, 8, 13]) {
    test(`eyebrow, stage highlight and truck position on step ${stepNumber} come from steps.ts`, async ({
      page,
    }) => {
      const expected = progressFor(STEPS[stepNumber - 1].id);
      await openStep(page, stepNumber);
      if (stepNumber !== 13) {
        // A grouped page is one mile, so its eyebrow drops the mile label.
        const eyebrow = isGrouped(page) ? expected.eyebrow.replace(/ · .*$/, "") : expected.eyebrow;
        await expect(page.locator("[data-slot=sign-eyebrow]")).toHaveText(eyebrow);
        await expect(page.locator("[data-slot=sign-title]")).toHaveText(
          isGrouped(page) ? expected.mile.label : expected.step.question,
        );
      }
      await expect(page.getByRole("progressbar", { name: "Progress" })).toHaveAttribute(
        "aria-valuetext",
        expected.srLabel,
      );
      await expect(page.locator("[aria-current=step]")).toHaveAttribute(
        "data-mile",
        String(expected.mile.mile),
      );
      await expect(page.locator("[data-slot=lane-truck]")).toHaveAttribute(
        "style",
        new RegExp(`left:\\s*${expected.percent}%`),
      );
      await expect(page.locator("[data-slot=lane-fill]")).toHaveAttribute(
        "style",
        new RegExp(`width:\\s*${expected.percent}%`),
      );
      await expect(page.locator("[data-state=done]")).toHaveCount(expected.completedMiles.length);
    });
  }

  for (const stepNumber of [2, 5, 7, 10, 12]) {
    test(`every control on step ${stepNumber} is at least 48px, the main action 56px`, async ({
      page,
    }) => {
      await openStep(page, stepNumber);
      const small = await page.evaluate(() => {
        const found: string[] = [];
        const controls = document.querySelectorAll<HTMLElement>(
          "button, a[href], input:not([type=hidden]), select, textarea, [role=checkbox], [role=radio]",
        );
        for (const el of controls) {
          if (el.closest("nextjs-portal") || el.closest("footer")) continue;
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") continue;
          // Screen-reader-only controls (file pickers behind a button, the skip link until it
          // is focused) are not tap targets. Tailwind's sr-only clips with clip-path.
          if (style.clipPath === "inset(50%)" || el.getAttribute("aria-hidden")) continue;
          // A control inside a label is tapped through the label, like the consent box.
          const label = el.closest("label");
          if (label && label.getBoundingClientRect().height >= 48) continue;
          // Links inside running text are exempt, like the terms links in the consent card.
          if (el.tagName === "A" && el.closest("p, span")) continue;
          const min =
            el.closest("[data-slot=action-bar]") && el.matches("[data-variant=primary]") ? 56 : 48;
          if (rect.height < min - 0.5) {
            const name = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30);
            found.push(
              `${el.tagName.toLowerCase()} "${name}" ${rect.height}px ${el.outerHTML.slice(0, 160)}`,
            );
          }
        }
        return found;
      });
      expect(small).toEqual([]);
    });
  }

  test("reduced motion turns the lane transitions off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openStep(page, 5);
    const durations = await page.evaluate(() => ({
      fill: getComputedStyle(document.querySelector("[data-slot=lane-fill]")!).transitionDuration,
      truck: getComputedStyle(document.querySelector("[data-slot=lane-truck]")!).transitionDuration,
      button: getComputedStyle(document.querySelector("[data-slot=button]")!).transitionDuration,
    }));
    expect(durations).toEqual({ fill: "0s", truck: "0s", button: "0s" });
  });

  test("light is the default and dark mode keeps every rule", async ({ page }) => {
    await openStep(page, 10);
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const card = page.getByRole("radio", { name: /Class A/ });
    await card.click();
    await expect(card).toHaveAttribute("aria-checked", "true");
    expect(await orangeViolations(page)).toEqual([]);
    await expect(card).toHaveCSS("border-top-color", await tokenRgb(page, "--selection"));
  });
});
