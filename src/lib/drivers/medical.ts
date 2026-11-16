import { format, parseISO } from "date-fns";
import { houstonDate } from "@/lib/drivers/twic";
import type { Driver } from "@/types/domain";

/**
 * The medical card date (0041), self-reported. A passed date stops shift offers, the same rule
 * as shift_ready_missing(); no date is unknown, never expired, so drivers who signed up before
 * the date was asked keep working.
 */
export function medicalCardExpired(driver: Pick<Driver, "medicalCardExpiresOn">, today: string = houstonDate()): boolean {
  return driver.medicalCardExpiresOn !== null && driver.medicalCardExpiresOn < today;
}

/** Said yes before the date was asked. */
export function needsMedicalDate(driver: Pick<Driver, "medicalCardActive" | "medicalCardExpiresOn">): boolean {
  return driver.medicalCardActive === true && driver.medicalCardExpiresOn === null;
}

/** How the card reads to a carrier or an admin, after the TWIC: "medical card to Dec 14, 2026". */
export function medicalSummary(
  driver: Pick<Driver, "medicalCardActive" | "medicalCardExpiresOn">,
  today: string = houstonDate(),
): string {
  if (driver.medicalCardActive === null) return "Not answered";
  if (!driver.medicalCardActive) return "medical card not current";
  if (driver.medicalCardExpiresOn === null) return "medical card current";
  if (driver.medicalCardExpiresOn < today) return "medical card expired";
  return `medical card to ${format(parseISO(driver.medicalCardExpiresOn), "MMM d, yyyy")}`;
}

/** The dashboard and profile line for a driver who said yes with no date. */
export const MEDICAL_DATE_PROMPT = "Add your medical card expiry date to your profile.";
