import { format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { Driver } from "@/types/domain";

/** Houston, where the shifts are. */
const ZONE = "America/Chicago";
const DAY = 24 * 60 * 60 * 1000;
export const TWIC_ISSUE_DAYS = 90;

export const houstonDate = (date: Date = new Date()): string => formatInTimeZone(date, ZONE, "yyyy-MM-dd");

/** A TWIC counts only with a date not yet passed; expired, or a yes with no date, is treated as no. */
export function twicValid(driver: Pick<Driver, "twicActive" | "twicExpiresOn">, on: string = houstonDate()): boolean {
  return driver.twicActive === true && driver.twicExpiresOn !== null && driver.twicExpiresOn >= on;
}

/** Said yes before the date was asked. */
export function needsTwicDate(driver: Pick<Driver, "twicActive" | "twicExpiresOn">): boolean {
  return driver.twicActive === true && driver.twicExpiresOn === null;
}

export type TwicIssue = "issue" | "needs_review" | null;

/** Turned away at the gate in the last 90 days; twice in 90 days reads Needs review. */
export function twicIssue(driver: Pick<Driver, "twicIssueAt" | "twicIssuePriorAt">, now: Date = new Date()): TwicIssue {
  const within = (at: string | null) => at !== null && now.getTime() - Date.parse(at) <= TWIC_ISSUE_DAYS * DAY;
  if (!within(driver.twicIssueAt)) return null;
  return within(driver.twicIssuePriorAt) ? "needs_review" : "issue";
}

/** How the card reads to a carrier or an admin. */
export function twicSummary(driver: Pick<Driver, "twicActive" | "twicExpiresOn">, on: string = houstonDate()): string {
  if (driver.twicActive === null) return "Not answered";
  if (!driver.twicActive) return "No TWIC";
  if (driver.twicExpiresOn === null) return "TWIC, no expiry date";
  if (driver.twicExpiresOn < on) return "TWIC expired";
  return `TWIC to ${format(parseISO(driver.twicExpiresOn), "MMM d, yyyy")}`;
}

/** The dashboard and profile line for a driver who said yes with no date. */
export const TWIC_DATE_PROMPT = "Add your TWIC expiry date to get port shifts.";
