import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { SHIFT_TIME_ZONE } from "@/lib/shifts/texts";
import type { Shift } from "@/types/domain";

/**
 * Quiet hours (decision C, 2026-11-01): a broadcast posted between 9 PM and 7 AM Houston time
 * waits until 7 AM, unless the shift starts within 12 hours, when it goes at once.
 */
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 7;
export const URGENT_WITHIN_HOURS = 12;

const HOUR = 60 * 60 * 1000;

/** When the broadcast should go: null for now, or the next 7:00 AM in Houston. */
export function sendAfterFor(postedAt: Date, startsAt: Date): Date | null {
  const later = quietHoursSendAt(postedAt);
  if (!later) return null;
  if (startsAt.getTime() - postedAt.getTime() < URGENT_WITHIN_HOURS * HOUR) return null;
  return later;
}

/** Quiet hours for any text (the approval text too): null by day, else the next 7:00 AM Houston. */
export function quietHoursSendAt(now: Date): Date | null {
  const hour = Number(formatInTimeZone(now, SHIFT_TIME_ZONE, "H"));
  if (hour < QUIET_START_HOUR && hour >= QUIET_END_HOUR) return null;
  const today = formatInTimeZone(now, SHIFT_TIME_ZONE, "yyyy-MM-dd");
  const seven = fromZonedTime(`${today}T0${QUIET_END_HOUR}:00:00`, SHIFT_TIME_ZONE);
  if (hour < QUIET_END_HOUR) return seven;
  return fromZonedTime(
    `${formatInTimeZone(new Date(seven.getTime() + 26 * HOUR), SHIFT_TIME_ZONE, "yyyy-MM-dd")}T0${QUIET_END_HOUR}:00:00`,
    SHIFT_TIME_ZONE,
  );
}

/** The profile reminder goes only between 10 AM and 7 PM Houston time (change request of 2026-11-01). */
export const REMINDER_START_HOUR = 10;
export const REMINDER_END_HOUR = 19;

export function isReminderWindow(now: Date): boolean {
  const hour = Number(formatInTimeZone(now, SHIFT_TIME_ZONE, "H"));
  return hour >= REMINDER_START_HOUR && hour < REMINDER_END_HOUR;
}

/** "7:00 AM" or "Sends at 7:00 AM" style label for a queued broadcast. */
export function formatSendTime(sendAfter: string | Date): string {
  return formatInTimeZone(new Date(sendAfter), SHIFT_TIME_ZONE, "h:mm a");
}

/**
 * True while a YES can still book the shift: before its start, or for a released shift
 * (a no-show was replaced) until its end. The same rule as claim_shift().
 */
export function isBookable(shift: Pick<Shift, "startsAt" | "endsAt" | "releasedAt">, now: Date): boolean {
  if (new Date(shift.startsAt) > now) return true;
  return shift.releasedAt !== null && new Date(shift.endsAt) > now;
}

/** What to call the shift now: an open shift nobody can book any more is expired already. */
export function displayStatus(
  shift: Pick<Shift, "status" | "startsAt" | "endsAt" | "releasedAt">,
  now: Date,
): Shift["status"] {
  if (shift.status === "open" && !isBookable(shift, now)) return "expired";
  return shift.status;
}
