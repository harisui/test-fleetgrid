import { formatInTimeZone } from "date-fns-tz";
import { SMS_APPROVED, SMS_REMINDER, SMS_SAMPLE_FILLED } from "@/content/sms-samples";
import type { CdlClass } from "@/types/domain";

/**
 * The shift texts, filled in. The three Twilio-approved texts (2026-10-29, the samples in
 * src/content/sms-samples.ts) keep their words exactly; only the place, the date and time
 * and the code change. A unit test fills each with the sample's values and compares it to
 * the sample, so the wording cannot drift.
 *
 * The others are FleetGrid's replies and notices that Twilio has not seen. The cancellation
 * notice is approved by the client (2026-11-01); the rest wait for her yes on their wording
 * (PENDING_APPROVAL). None is marketing.
 */

/** Shifts are in the Houston area; every time in a text and on a page is Houston time. */
export const SHIFT_TIME_ZONE = "America/Chicago";

export interface ShiftTextFields {
  cdlClass: Exclude<CdlClass, "none">;
  city: string;
  state: string;
  startsAt: string | Date;
}

/** "Tue Oct 14 6:00 AM", Houston time. */
export function formatShiftWhen(startsAt: string | Date): string {
  return formatInTimeZone(new Date(startsAt), SHIFT_TIME_ZONE, "EEE MMM d h:mm a");
}

/** "Pasadena TX". */
export function formatShiftPlace(shift: Pick<ShiftTextFields, "city" | "state">): string {
  return `${shift.city} ${shift.state}`;
}

/** The shift alert (approved). */
export function offerText(shift: ShiftTextFields, code: string): string {
  return `FleetGrid: New shift on FleetGrid for CDL-${shift.cdlClass} drivers. ${formatShiftPlace(shift)}, ${formatShiftWhen(shift.startsAt)}. Reply YES ${code} to book it. Reply STOP to opt out.`;
}

/** Booked, to the driver whose YES won (approved). The on-site contact is on My shifts. */
export function bookedText(shift: ShiftTextFields): string {
  return `FleetGrid: Your shift is booked. CDL-${shift.cdlClass}, ${formatShiftPlace(shift)}, ${formatShiftWhen(shift.startsAt)}. See details in your FleetGrid account: fleetgridus.com/driver. Reply HELP for help.`;
}

/** Filled, to a YES after the shift was booked (approved). */
export const FILLED_TEXT = SMS_SAMPLE_FILLED;

/** The texts whose words still wait for the client (decisions of 2026-11-01). */
export const PENDING_APPROVAL = ["format_help", "closed"] as const;

/** To the booked driver when the carrier cancels (decision 2; the client approved it 2026-11-01). */
export function cancelledText(shift: ShiftTextFields): string {
  return `FleetGrid: Your booked shift on ${formatShiftWhen(shift.startsAt)} in ${formatShiftPlace(shift)} was cancelled by the company that posted it. Reply HELP for help.`;
}

/** To a driver with texts on when an admin approves them, once (Annie approved 2026-11-01). */
export const APPROVED_TEXT = SMS_APPROVED;

/** To a driver with texts on whose card is unfinished and idle for 24 hours, once (Annie approved 2026-11-01). */
export const REMINDER_TEXT = SMS_REMINDER;

/** A reply FleetGrid cannot read: how to book (pending the client's yes). */
export const FORMAT_HELP_TEXT =
  "FleetGrid: To book a shift, reply YES and the 4-digit code from the shift text, like YES 4821. Reply HELP for help.";

/** A YES for a shift that was cancelled or has started (pending the client's yes). */
export const CLOSED_TEXT =
  "FleetGrid: This shift is no longer open. We'll text you about the next matching shift. Reply STOP to opt out.";

/** The kinds the text log records. */
export type SmsKind =
  | "offer"
  | "booked"
  | "filled"
  | "closed"
  | "cancelled"
  | "approved"
  | "reminder"
  | "welcome"
  | "doc_reminder"
  | "cdl_state_notice"
  | "notice"
  | "security"
  | "format_help"
  | "inbound";
