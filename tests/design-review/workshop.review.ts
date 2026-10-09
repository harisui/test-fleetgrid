import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { MILES, STEPS, stepsOfMile } from "../../src/lib/onboarding/steps";
import {
  expectScreen,
  login,
  moveDriverToStep,
  nextButton,
  PHONES,
  resetUser,
  seedDriverAtStep,
} from "../e2e/helpers";

/**
 * The design review: every page of the onboarding (one per mile, the same on every device)
 * photographed at phone size in light and dark and at desktop size, next to the approved
 * Workshop prototype frame where one exists. Writes design-review/index.html and the images
 * it shows. Run with `pnpm design-review` against the local dev server.
 */

const OUT = resolve("design-review");
const PROTOTYPE_URL = pathToFileURL(resolve("tests/design-review/workshop-prototype.html")).href;
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];
const PHONE = { width: 390, height: 844 };
/** Tall enough for a whole mile, so the sticky action bar sits where a person sees it. */
const DESKTOP = { width: 1280, height: 1200 };

/** The prototype draws these states; the app is put in the same state before the shot. */
const STATES: Partial<Record<string, (page: Page) => Promise<void>>> = {
  name: async (page) => {
    await page.getByLabel("ZIP code", { exact: true }).fill("6060");
    await nextButton(page).click();
    await expect(page.getByText("Enter a 5-digit ZIP code, like 60601")).toBeVisible();
  },
};

/** The pages: the first screen of each mile, plus the done screen. */
const PAGES = [
  ...MILES.map((mile) => stepsOfMile(mile.mile)[0]),
  STEPS[STEPS.length - 1],
] as const;
const PROTOTYPE_DESKTOP_FRAMES = ["zip", "cdlClass"];

/**
 * The prototype predates the short flow of 2026-10-09 (one page per mile, the MVR and the
 * cards). A page without a frame is marked "no prototype frame" in the report.
 */
const hasPrototypeFrame = (stepId: string, theme: Theme) =>
  existsSync(file("frames", `${stepId}-${theme}.png`));

const file = (...parts: string[]) => resolve(OUT, ...parts);
const rel = (...parts: string[]) => parts.join("/");

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // The Next.js dev-tools badge is not part of the app, and a focus ring is not a state the
    // prototype draws.
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await page.waitForTimeout(150);
}

async function prototypeTheme(page: Page, theme: Theme) {
  await page.goto(PROTOTYPE_URL);
  await page.evaluate((theme) => {
    document.documentElement.setAttribute("data-palette", "steel");
    document.documentElement.setAttribute("data-theme", theme);
  }, theme);
  await settle(page);
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  // "frames", not "prototype": hosts treat that word as reserved in a path.
  mkdirSync(file("frames"), { recursive: true });
  mkdirSync(file("app"), { recursive: true });
});

test.afterAll(async () => {
  await resetUser(PHONES.driver);
});

for (const theme of THEMES) {
  test(`prototype frames (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await prototypeTheme(page, theme);
    for (const step of STEPS) {
      const frame = page.locator(`.phone[data-step="${step.id}"]`);
      if ((await frame.count()) === 0) continue;
      await frame.scrollIntoViewIfNeeded();
      await frame.screenshot({ path: file("frames", `${step.id}-${theme}.png`) });
    }
    for (const id of PROTOTYPE_DESKTOP_FRAMES) {
      const frame = page.locator(`.desk-frame[data-step="${id}"]`);
      await frame.scrollIntoViewIfNeeded();
      await frame.screenshot({ path: file("frames", `${id}-${theme}-desktop.png`) });
    }
  });

  test(`app pages (${theme})`, async ({ page }) => {
    await page
      .context()
      .addCookies([{ name: "fleetgrid-theme", value: theme, url: "http://localhost:3000" }]);
    await seedDriverAtStep(PHONES.driver, 2);
    await page.setViewportSize(PHONE);
    await login(page, PHONES.driver);

    for (const step of PAGES) {
      const stepNumber = STEPS.indexOf(step) + 1;
      await moveDriverToStep(PHONES.driver, stepNumber);
      for (const [size, suffix] of [
        [PHONE, ""],
        [DESKTOP, "-desktop"],
      ] as const) {
        await page.setViewportSize(size);
        await page.goto("/driver/onboarding");
        await expectScreen(page, step.question);
        await STATES[step.id]?.(page);
        await settle(page);
        // The viewport, not the full page: a sticky action bar painted mid-page misleads.
        await page.screenshot({ path: file("app", `${step.id}-${theme}${suffix}.png`) });
      }
    }
  });
}

test("report", () => {
  writeFileSync(file("index.html"), report());
});

function report(): string {
  const title = (step: (typeof PAGES)[number]) =>
    step.id === "done" ? step.question : `${MILES[step.mile - 1].label}: ${step.question}`;

  const phoneRows = PAGES.map((step, index) => {
    const cells = THEMES.map(
      (theme) => `
        ${
          hasPrototypeFrame(step.id, theme)
            ? `<figure>
          <img src="${rel("frames", `${step.id}-${theme}.png`)}" alt="Prototype, ${step.question}, ${theme}" loading="lazy">
          <figcaption>Prototype · ${theme}</figcaption>
        </figure>`
            : ""
        }
        <figure>
          <img src="${rel("app", `${step.id}-${theme}.png`)}" alt="App, ${title(step)}, ${theme}" loading="lazy">
          <figcaption>App · ${theme}${hasPrototypeFrame(step.id, theme) ? "" : " · no prototype frame (page of the 2026-10-09 flow)"}</figcaption>
        </figure>`,
    ).join("");
    return `
      <section class="screen" id="screen-${index + 1}">
        <h2><span class="num">${index + 1}</span> ${title(step)}</h2>
        <div class="row phones">${cells}</div>
      </section>`;
  }).join("");

  const desktopRows = PAGES.map((step, index) => {
    const prototype = PROTOTYPE_DESKTOP_FRAMES.includes(step.id);
    const cells = THEMES.map(
      (theme) => `
        ${
          prototype
            ? `<figure>
          <img src="${rel("frames", `${step.id}-${theme}-desktop.png`)}" alt="Prototype desktop, ${step.question}, ${theme}" loading="lazy">
          <figcaption>Prototype · ${theme}</figcaption>
        </figure>`
            : ""
        }
        <figure>
          <img src="${rel("app", `${step.id}-${theme}-desktop.png`)}" alt="App desktop, ${title(step)}, ${theme}" loading="lazy">
          <figcaption>App · ${theme}${prototype ? "" : " · no prototype frame for this page"}</figcaption>
        </figure>`,
    ).join("");
    return `
      <section class="screen">
        <h2><span class="num">${index + 1}</span> ${title(step)} <small>desktop</small></h2>
        <div class="row desktops">${cells}</div>
      </section>`;
  }).join("");

  return `<title>Workshop Design Review</title>
<style>
  /* Layout: a review board. One section per page, prototype frame beside the app shot, light then dark. */
  :root {
    --bg: #ececec; --surface: #ffffff; --fg: #1b1e22; --muted: #5d636a; --line: #c9ccd0; --accent: #b84a00;
    --font-body: "Geist", "Segoe UI", system-ui, sans-serif;
    --font-mono: "Geist Mono", ui-monospace, "Cascadia Mono", monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #121416; --surface: #1b1e22; --fg: #f0f1f2; --muted: #a3a9b0; --line: #3a4046; --accent: #f08a3c; color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #121416; --surface: #1b1e22; --fg: #f0f1f2; --muted: #a3a9b0; --line: #3a4046; --accent: #f08a3c; color-scheme: dark;
  }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 var(--font-body); }
  .wrap { padding-block: 32px 64px; padding-inline: 16px; max-width: 1680px; margin-inline: auto; }
  header h1 { font-size: 28px; margin: 0 0 4px; text-wrap: balance; }
  header p { margin: 0; color: var(--muted); max-width: 65ch; }
  nav { display: flex; flex-wrap: wrap; gap: 6px; margin-block: 20px 36px; }
  nav a { font: 500 13px/1 var(--font-mono); color: var(--fg); text-decoration: none; border: 1px solid var(--line); border-radius: 4px; padding: 7px 9px; background: var(--surface); }
  nav a:hover, nav a:focus-visible { border-color: var(--accent); outline: none; }
  .screen { border-top: 1px solid var(--line); padding-block: 28px; }
  .screen h2 { font-size: 20px; margin: 0 0 16px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; text-wrap: balance; }
  .screen h2 small { font: 400 13px/1 var(--font-mono); color: var(--muted); letter-spacing: 0.02em; text-transform: uppercase; }
  .num { font: 700 13px/1 var(--font-mono); color: var(--accent); border: 1px solid var(--accent); border-radius: 4px; padding: 4px 6px; }
  .row { display: grid; gap: 16px; }
  .phones { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
  .desktops { grid-template-columns: repeat(auto-fit, minmax(min(100%, 640px), 1fr)); }
  figure { margin: 0; min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 10px; }
  figure img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line); }
  figcaption { font: 500 12px/1.4 var(--font-mono); color: var(--muted); margin-top: 8px; letter-spacing: 0.02em; text-transform: uppercase; }
</style>
<div class="wrap">
  <header>
    <h1>Workshop design review</h1>
    <p>Each page of the sign-up (one per mile, the same on every device) next to the approved Workshop prototype frame where one exists. Phones at 390×844 in light and dark; desktop at 1280 wide. Prototype frames are 390×800 with the phone bezel; app shots are the real viewport, so a page longer than the screen is cut where the screen ends. Captured ${new Date().toISOString().slice(0, 10)}.</p>
    <nav aria-label="Pages">${PAGES.map((step, index) => `<a href="#screen-${index + 1}">${index + 1} ${step.id === "done" ? "done" : MILES[step.mile - 1].label}</a>`).join("")}</nav>
  </header>
  ${phoneRows}
  <section class="screen"><h2>Desktop</h2></section>
  ${desktopRows}
</div>
`;
}
