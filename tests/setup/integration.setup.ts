import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

/**
 * Integration tests talk to the local Supabase stack only.
 * Values come from .env.local (or the environment in CI).
 */
const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) loadEnvFile(envFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);

if (!isLocal) {
  throw new Error(
    `Integration tests must run against local Supabase, but NEXT_PUBLIC_SUPABASE_URL is "${url}". ` +
      "Run `pnpm exec supabase start` and copy the local keys into .env.local.",
  );
}

for (const key of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[key]) throw new Error(`${key} is required for integration tests`);
}
