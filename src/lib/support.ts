/**
 * Who FleetGrid is and how to reach it, shown in the footer, the Contact section of the
 * landing page, the Help sheet and the SMS Terms (Twilio toll-free verification needs an
 * established, reachable business on the website). The values the client gave on
 * 2026-10-10 are the defaults; SUPPORT_EMAIL, SUPPORT_PHONE and BUSINESS_ADDRESS in the
 * environment override them without a code change.
 */

export const BUSINESS_NAME = "FleetGrid LLC";
export const SUPPORT_EMAIL_DEFAULT = "support@fleetgridus.com";
// No phone number is shown on the site (user, 2026-10-10) unless SUPPORT_PHONE is set.
/** A registered agent address, not a home address (client, 2026-10-10). One line per entry. */
export const BUSINESS_ADDRESS_DEFAULT: readonly string[] = [
  "8401 Mayland Dr. STE A",
  "Richmond, VA 23294",
];

export interface SupportContact {
  email?: string;
  phone?: string;
  /** Postal address, one line per entry. */
  address?: readonly string[];
}

export interface SupportEnv {
  SUPPORT_EMAIL?: string;
  SUPPORT_PHONE?: string;
  /** Lines separated by " | ", for example "8401 Mayland Dr. STE A | Richmond, VA 23294". */
  BUSINESS_ADDRESS?: string;
}

const set = (value: string | undefined) => (value && value.trim() ? value.trim() : undefined);

/** The three variables straight from the process, blanks meaning unset. Not secrets. */
export function readSupportEnv(
  source: Record<string, string | undefined> = process.env,
): SupportEnv {
  return {
    SUPPORT_EMAIL: set(source.SUPPORT_EMAIL),
    SUPPORT_PHONE: set(source.SUPPORT_PHONE),
    BUSINESS_ADDRESS: set(source.BUSINESS_ADDRESS),
  };
}

/** The contact details, from the environment where set and the client's defaults otherwise. */
export function getSupportContact(
  env: SupportEnv = readSupportEnv(),
): SupportContact & { email: string; address: readonly string[] } {
  const phone = set(env.SUPPORT_PHONE);
  return {
    email: set(env.SUPPORT_EMAIL) ?? SUPPORT_EMAIL_DEFAULT,
    ...(phone && { phone }),
    address: set(env.BUSINESS_ADDRESS)
      ? env.BUSINESS_ADDRESS!.split("|")
          .map((line) => line.trim())
          .filter(Boolean)
      : BUSINESS_ADDRESS_DEFAULT,
  };
}
