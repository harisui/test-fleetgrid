/**
 * The client's sentences on quiet hours and cancelled shifts (Annie, 2026-11-01), word for
 * word, pinned by tests. The rule itself lives in src/lib/shifts/schedule.ts.
 */

/** The carriers page and the carrier FAQ. */
export const QUIET_HOURS_CARRIER =
  "Late-night posts are sent at 7 AM so drivers aren't woken up, unless the shift starts within 12 hours.";

/** The driver FAQ and the SMS Terms (Message frequency). */
export const QUIET_HOURS_DRIVER =
  "We don't send shift alerts between 9 PM and 7 AM Houston time, unless a shift starts within 12 hours.";

/** The driver FAQ. */
export const CANCELLED_SHIFT_DRIVER = "If a company cancels your booked shift, we text you right away.";
