import { getServerEnv, type ServerEnv } from "@/lib/env";

export { CARRIER_COMING_SOON_PATH } from "@/lib/auth/routes";

type AvailabilityEnv = Pick<ServerEnv, "CARRIER_DISABLED">;

/**
 * The carrier side can be switched off with CARRIER_DISABLED=true. Then the landing page
 * button, the login with role=carrier, the role picker, /carrier/* and the choose-role action
 * all lead to the "coming soon" page. The flag is read in one place (src/lib/env.ts) and is
 * off unless set to exactly "true".
 */
export function isCarrierDisabled(env: AvailabilityEnv = getServerEnv()): boolean {
  return env.CARRIER_DISABLED;
}
