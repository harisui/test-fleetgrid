import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  // Tests share one local database and a small set of test phone numbers.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    // iPhone 13 viewport and user agent, rendered with Chromium so CI needs one browser engine.
    {
      name: "mobile-iphone-13",
      use: { ...devices["iPhone 13"], browserName: "chromium", defaultBrowserType: "chromium" },
    },
    { name: "mobile-pixel-7", use: { ...devices["Pixel 7"] } },
    // Optional: the real Safari engine. Run with E2E_WEBKIT=1 (needs `playwright install webkit`).
    ...(process.env.E2E_WEBKIT
      ? [{ name: "mobile-safari-webkit", use: { ...devices["iPhone 13"] } }]
      : []),
  ],
  webServer: {
    command: isCI ? "pnpm build && pnpm start" : "pnpm dev",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
