import { getServerEnv, type ServerEnv } from "@/lib/env";

export interface TestLoginPrefill {
  /** E.164 test number for the login form. */
  phone?: string;
  /** The code that number accepts, for the verify form. */
  code?: string;
}

type PrefillEnv = Pick<ServerEnv, "PREFILL_TEST_LOGIN" | "TEST_PHONE_DRIVER" | "TEST_OTP">;

/**
 * Local convenience: with PREFILL_TEST_LOGIN=true the login and code forms start filled with
 * the test driver number and its code, so a developer taps through in two clicks.
 * Never active in a production build, whatever the variables say.
 */
export function testLoginPrefill(
  env: PrefillEnv = getServerEnv(),
  nodeEnv: string | undefined = process.env.NODE_ENV,
): TestLoginPrefill {
  if (nodeEnv === "production" || env.PREFILL_TEST_LOGIN !== "true") return {};
  return { phone: env.TEST_PHONE_DRIVER, code: env.TEST_OTP };
}
