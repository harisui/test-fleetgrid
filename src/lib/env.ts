import { z } from "zod";

/**
 * Environment validation.
 *
 * - `parseClientEnv` / `parseServerEnv` are pure and take the source object, so they are easy to test.
 * - `getClientEnv` / `getServerEnv` read `process.env` once and cache the result.
 * - Variables for later milestones (Twilio app use, Stripe) are optional until that milestone starts.
 *
 * Never import `getServerEnv` from a client component.
 */

/** Treat empty strings (as left in a copied .env.example) the same as missing. */
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const requiredString = (name: string) =>
  z.preprocess(
    emptyToUndefined,
    z.string({ error: `${name} is required` }).min(1, `${name} is required`),
  );

const requiredUrl = (name: string) =>
  z.preprocess(
    emptyToUndefined,
    z.string({ error: `${name} is required` }).pipe(z.url(`${name} must be a valid URL`)),
  );

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

/** "true" is on; anything else, including unset, is off. */
const flag = z.preprocess((value) => value === "true" || value === true, z.boolean());

/** The local Supabase stack, where test OTP numbers exist. Anything else is a hosted project. */
export function isLocalSupabaseUrl(url: string | undefined): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url ?? "");
}

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: requiredUrl("NEXT_PUBLIC_APP_URL"),
  NEXT_PUBLIC_SUPABASE_URL: requiredUrl("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredString("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  // Milestone 2
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalString,
});

export const serverEnvSchema = clientEnvSchema
  .extend({
    SUPABASE_SERVICE_ROLE_KEY: requiredString("SUPABASE_SERVICE_ROLE_KEY"),
    // Milestone 3 (app use). Supabase Auth uses Twilio via its own config.
    TWILIO_ACCOUNT_SID: optionalString,
    TWILIO_AUTH_TOKEN: optionalString,
    TWILIO_MESSAGING_SERVICE_SID: optionalString,
    // Milestone 2
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_PRICE_ID_MONTHLY: optionalString,
    // Test conveniences, all behind one flag that is off unless set to "true": the login and
    // code forms start filled with TEST_PHONE_DRIVER and TEST_OTP (src/lib/auth/prefill.ts).
    ENABLE_TEST_LOGIN: flag,
    TEST_PHONE_DRIVER: optionalString,
    TEST_OTP: optionalString,
    NODE_ENV: optionalString,
  })
  .superRefine((env, context) => {
    // A production build may only carry the flag against the local stack (CI). Against a
    // hosted project it would hand out a real login, so the server refuses to start.
    if (
      env.ENABLE_TEST_LOGIN &&
      env.NODE_ENV === "production" &&
      !isLocalSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL)
    ) {
      context.addIssue({
        code: "custom",
        path: ["ENABLE_TEST_LOGIN"],
        message:
          "ENABLE_TEST_LOGIN must be off in production: it is on and NEXT_PUBLIC_SUPABASE_URL is not the local stack",
      });
    }
  });

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

type EnvSource = Record<string, string | undefined>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Invalid environment variables:\n${issues.map((issue) => `  - ${issue}`).join("\n")}\n` +
        "Copy .env.example to .env.local and fill in the missing values.",
    );
    this.name = "EnvValidationError";
  }
}

function parseWith<T>(schema: z.ZodType<T>, source: EnvSource): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues.map((issue) => issue.message));
  }
  return result.data;
}

export function parseClientEnv(source: EnvSource): ClientEnv {
  return parseWith(clientEnvSchema, source);
}

export function parseServerEnv(source: EnvSource): ServerEnv {
  return parseWith(serverEnvSchema, source);
}

let cachedClientEnv: ClientEnv | undefined;
let cachedServerEnv: ServerEnv | undefined;

/** Safe on the client. NEXT_PUBLIC_ variables must be referenced statically so Next.js can inline them. */
export function getClientEnv(): ClientEnv {
  cachedClientEnv ??= parseClientEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
  return cachedClientEnv;
}

/** Server only. Includes secrets. */
export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() must never be called in the browser");
  }
  cachedServerEnv ??= parseServerEnv(process.env);
  return cachedServerEnv;
}

/** Test helper: clears the cached values. */
export function resetEnvCache(): void {
  cachedClientEnv = undefined;
  cachedServerEnv = undefined;
}
