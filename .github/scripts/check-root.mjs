#!/usr/bin/env node
/**
 * Repository root guard.
 *
 * Fails when a file or folder is tracked at the repository root that is not on the allow list
 * below. This keeps notes, editor and assistant files, and build output out of the repo.
 * It checks what git tracks, so local untracked files (node_modules, .env.local) do not matter.
 *
 * Run: node .github/scripts/check-root.mjs
 */
import { execSync } from "node:child_process";

const ALLOWED = new Set([
  // git and GitHub
  ".gitattributes",
  ".gitignore",
  ".github",
  // Next.js app
  "src",
  "public",
  "next.config.ts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "postcss.config.mjs",
  "components.json",
  // tooling
  "eslint.config.mjs",
  ".prettierrc.json",
  ".prettierignore",
  ".env.example",
  // database and tests
  "supabase",
  "tests",
  "vitest.config.ts",
  "vitest.integration.config.ts",
  "playwright.config.ts",
  "playwright.design-review.config.ts",
  // docs
  "README.md",
]);

const tracked = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .map((path) => path.split("/")[0]);

const rootEntries = [...new Set(tracked)].sort();
const extra = rootEntries.filter((entry) => !ALLOWED.has(entry));

if (extra.length > 0) {
  console.error(
    "Root guard failed. These root files or folders are not allowed in the repository:",
  );
  for (const entry of extra) console.error(`  - ${entry}`);
  console.error(
    "\nRemove them (git rm --cached <path> and add to .gitignore), or add them to the allow list in .github/scripts/check-root.mjs if they belong to the app.",
  );
  process.exit(1);
}

console.log(`Root guard passed: ${rootEntries.length} allowed root entries.`);
