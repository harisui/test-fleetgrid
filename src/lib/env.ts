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
    // The bearer token the scheduled jobs must send (Vercel Cron sends it when the variable
    // is set). Without it /api/cron/* refuses every call.
    CRON_SECRET: optionalString,
    // Test conveniences, all behind one flag that is off unless set to "true": the login and
    // code forms start filled with TEST_PHONE_DRIVER and TEST_OTP (src/lib/auth/prefill.ts).
    ENABLE_TEST_LOGIN: flag,
    // "true" keeps the in-memory test checkout even when the Stripe keys are set, so the
    // browser tests can run on a machine that also tries the Stripe sandbox by hand. Only
    // with ENABLE_TEST_LOGIN (src/server/providers/createPaymentProvider.ts).
    PAYMENT_TEST_MODE: flag,
    // "true" hides the carrier side: /carrier/* and the carrier sign-up go to a "coming soon"
    // page (src/lib/carrier/availability.ts). Off unless set to exactly "true".
    CARRIER_DISABLED: flag,
    TEST_PHONE_DRIVER: optionalString,
    TEST_OTP: optionalString,
    NODE_ENV: optionalString,
    // Override the client's contact details in src/lib/support.ts (footer, Contact, Help, SMS Terms).
    SUPPORT_EMAIL: optionalString,
    SUPPORT_PHONE: optionalString,
    BUSINESS_ADDRESS: optionalString,
    // The website's contact form (src/server/services/ContactService.ts). Resend sends the
    // mail from CONTACT_FROM to CONTACT_TO; CONTACT_FORM_SECRET signs the form's timestamp.
    // Without the key or the secret, production shows the form's error state; development
    // logs the outcome and uses a built-in secret.
    RESEND_API_KEY: optionalString,
    CONTACT_TO: optionalString,
    CONTACT_FROM: optionalString,
    CONTACT_FORM_SECRET: optionalString,
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

/**
 * The marketing site's settings, all public and all optional: the canonical host, and the
 * two switches that show the toll-free number for calls or as the shift-text sender. Both
 * are off unless set to exactly "true" (the number stays off the site until the client
 * confirms calls are answered and Twilio has approved it).
 */
export const siteEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    emptyToUndefined,
    z.url("NEXT_PUBLIC_SITE_URL must be a valid URL").default("https://fleetgridus.com"),
  ),
  NEXT_PUBLIC_SHOW_PHONE: flag,
  NEXT_PUBLIC_SHOW_SMS_NUMBER: flag,
  // The Google Ads tag (src/lib/analytics.ts): an id to load it anywhere, "off" to load it
  // nowhere, unset to load the client's tag on the production deployment only. The labels are
  // the Google Ads conversion actions for a finished driver sign-up and a confirmed carrier
  // payment; unset, that conversion is not sent.
  NEXT_PUBLIC_GOOGLE_ADS_ID: optionalString,
  NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: optionalString,
  NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL: optionalString,
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type SiteEnv = z.infer<typeof siteEnvSchema>;

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

export function parseSiteEnv(source: EnvSource): SiteEnv {
  return parseWith(siteEnvSchema, source);
}

let cachedClientEnv: ClientEnv | undefined;
let cachedServerEnv: ServerEnv | undefined;
let cachedSiteEnv: SiteEnv | undefined;

/** Safe anywhere. Needs none of the Supabase variables, so the marketing site renders in any test. */
export function getSiteEnv(): SiteEnv {
  cachedSiteEnv ??= parseSiteEnv({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SHOW_PHONE: process.env.NEXT_PUBLIC_SHOW_PHONE,
    NEXT_PUBLIC_SHOW_SMS_NUMBER: process.env.NEXT_PUBLIC_SHOW_SMS_NUMBER,
    NEXT_PUBLIC_GOOGLE_ADS_ID: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
    NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL,
    NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL: process.env.NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL,
  });
  return cachedSiteEnv;
}

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
  cachedSiteEnv = undefined;
}
