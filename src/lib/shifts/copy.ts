import { formatInTimeZone } from "date-fns-tz";
import { formatShiftWhen, SHIFT_TIME_ZONE } from "@/lib/shifts/texts";
import type { Shift, ShiftStatus } from "@/types/domain";

/**
 * The words of the shift pages. The quiet-hours lines are the client's (Annie, 2026-11-01)
 * and pinned by tests.
 */

export const QUIET_HOURS_FORM_HELP =
  "Shifts posted between 9 PM and 7 AM go out at 7:00 AM, unless the shift starts within 12 hours.";
export const POST_BUTTON = "Post shift";
export const POST_BUTTON_QUIET = "Post. Sends at 7:00 AM";

/** "Scheduled to send at 7:00 AM" on the shift page while a broadcast is held. */
export function scheduledLine(sendAfter: string): string {
  return `Scheduled to send at ${formatInTimeZone(new Date(sendAfter), SHIFT_TIME_ZONE, "h:mm a")}`;
}

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  open: "Open",
  booked: "Booked",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** "Tue Oct 14, 6:00 AM to 2:00 PM". */
export function shiftTimeRange(shift: Pick<Shift, "startsAt" | "endsAt">): string {
  const end = formatInTimeZone(new Date(shift.endsAt), SHIFT_TIME_ZONE, "h:mm a");
  return `${formatShiftWhen(shift.startsAt).replace(/ (\d{1,2}:\d{2} [AP]M)$/, ", $1")} to ${end}`;
}

export const RECIPIENT_STATUS_LABELS = {
  queued: "Waiting",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Not delivered",
  booked: "Booked",
  too_late: "Replied late",
  no_show: "No-show",
} as const;
