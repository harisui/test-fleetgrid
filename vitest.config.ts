import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit tests. Integration tests live in vitest.integration.config.ts.
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup/unit.setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Generated code
        "src/types/**",
        "src/components/ui/**",
        // Covered by integration tests against local Supabase (section 9.2)
        "src/server/repositories/**",
        "src/lib/supabase/**",
        // Wiring and Next.js entry points, covered by e2e tests
        "src/server/container.ts",
        "src/server/actions/**",
        "src/instrumentation.ts",
        "src/proxy.ts",
        "src/app/**/layout.tsx",
        "src/app/**/page.tsx",
        "src/app/**/error.tsx",
        "src/app/**/not-found.tsx",
      ],
      thresholds: {
        lines: 85,
        "src/server/services/**": { lines: 95, branches: 90 },
        "src/lib/**": { lines: 95 },
      },
    },
  },
});
