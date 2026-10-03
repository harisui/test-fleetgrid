import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * The design review capture: screenshots of every onboarding screen next to the approved
 * Workshop prototype, written to design-review/. Not part of the e2e suite; run it with
 * `pnpm design-review` against the local dev server.
 */
export default defineConfig({
  ...base,
  testDir: "tests/design-review",
  testMatch: "**/*.review.ts",
  retries: 0,
  reporter: [["list"]],
  projects: [{ name: "design-review", use: { ...devices["Desktop Chrome"] } }],
});
