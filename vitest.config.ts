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
  },
});
