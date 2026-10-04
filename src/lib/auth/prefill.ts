import { getServerEnv, type ServerEnv } from "@/lib/env";

export interface TestLoginPrefill {
  /** E.164 test number for the login form. */
  phone?: string;
  /** The code that number accepts, for the verify form. */
  code?: string;
}

type PrefillEnv = Pick<ServerEnv, "ENABLE_TEST_LOGIN" | "TEST_PHONE_DRIVER" | "TEST_OTP">;

/**
 * Local convenience: with ENABLE_TEST_LOGIN=true the login and code forms start filled with
 * the test driver number and its code, so a developer taps through in two clicks. The flag
 * is read in one place (src/lib/env.ts), which also refuses it on a production build
 * against a hosted Supabase project.
 */
export function testLoginPrefill(env: PrefillEnv = getServerEnv()): TestLoginPrefill {
  if (!env.ENABLE_TEST_LOGIN) return {};
  return { phone: env.TEST_PHONE_DRIVER, code: env.TEST_OTP };
}
