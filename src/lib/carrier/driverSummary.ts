import { checkSummary, experienceSummary, mvrSummary } from "@/components/driver/SummaryCard";
import { CDL_CLASS_OPTIONS, EQUIPMENT_CHIPS, TRANSMISSION_OPTIONS } from "@/lib/onboarding/options";
import type { Driver } from "@/types/domain";

/** How a listed driver's answers read on the carrier side, in the words of the sign-up. */
export interface DriverSummary {
  cdlClass: string;
  experience: string;
  record: string;
  cards: string;
  /** The same two card answers apart, TWIC first, for a table cell with one per line. */
  cardLines: [string, string];
  endorsements: string;
  transmission: string;
  equipment: string;
}

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value;

export function summarizeDriver(driver: Driver): DriverSummary {
  const cardLines: [string, string] = [
    checkSummary("twicActive", driver.twicActive),
    checkSummary("medicalCardActive", driver.medicalCardActive),
  ];
  return {
    cdlClass: driver.cdlClass === "none" ? "Not answered" : labelOf(CDL_CLASS_OPTIONS, driver.cdlClass),
    experience: experienceSummary(driver.yearsExperience),
    record: mvrSummary(driver.mvrStatus),
    cards: cardLines.join(", "),
    cardLines,
    endorsements: driver.endorsements.length > 0 ? driver.endorsements.join(", ") : "None",
    transmission: driver.transmission
      ? labelOf(TRANSMISSION_OPTIONS, driver.transmission)
      : "Not answered",
    equipment:
      driver.equipmentTypes.map((kind) => labelOf(EQUIPMENT_CHIPS, kind)).join(", ") ||
      "Not answered",
  };
}

/** The mark a carrier sees on a listed driver who gets no shift texts. */
export const NO_SHIFT_TEXTS_LABEL = "No shift texts";

/** True when a shift broadcast would reach this driver: opted in and never replied STOP. */
export function receivesShiftTexts(driver: Pick<Driver, "smsOptIn" | "smsOptedOut">): boolean {
  return driver.smsOptIn && !driver.smsOptedOut;
}

/** "12.4 miles" or "0.0 miles", as the search reports it. */
export function formatMiles(miles: number): string {
  return `${miles.toFixed(1)} miles`;
}
