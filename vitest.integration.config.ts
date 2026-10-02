import { defineConfig } from "vitest/config";

// Integration tests run against the local Supabase stack (`supabase start`).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup/integration.setup.ts"],
    // Files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    passWithNoTests: true,
  },
});
