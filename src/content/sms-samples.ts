/**
 * The sample shift texts shown on the site (hero, carriers, drivers pages).
 *
 * The three templates in first-party words, exactly as revised for Twilio's toll-free review
 * (rejection 30468, 2026-10-29): FleetGrid itself posts the shift and books it, so nothing
 * reads like a third party passing leads on. Milestone 3 must send these same texts; the
 * place, date and code are the variables.
 * verify: "milestone-3-template"
 */

export interface SmsBubble {
  direction: "in" | "out";
  text: string;
}

/** The shift code in the sample: each broadcast carries its own, and the reply names it. */
export const SMS_SAMPLE_CODE = "4821";

/** The shift alert. */
export const SMS_SAMPLE_OFFER =
  "FleetGrid: New shift on FleetGrid for CDL-A drivers. Pasadena TX, Tue Oct 14 6:00 AM. Reply YES 4821 to book it. Reply STOP to opt out.";

export const SMS_SAMPLE_REPLY = "YES 4821";

/** Booked: sent to the driver whose YES booked the shift. */
export const SMS_SAMPLE_CONFIRMATION =
  "FleetGrid: Your shift is booked. CDL-A, Pasadena TX, Tue Oct 14 6:00 AM. See details in your FleetGrid account: fleetgridus.com/driver. Reply HELP for help.";

/** Filled: sent to a driver who replies after the shift is booked. */
export const SMS_SAMPLE_FILLED =
  "FleetGrid: This shift is already booked. We'll text you about the next matching shift. Reply STOP to opt out.";

export const SMS_SAMPLE_THREAD: readonly SmsBubble[] = [
  { direction: "in", text: SMS_SAMPLE_OFFER },
  { direction: "out", text: SMS_SAMPLE_REPLY },
  { direction: "in", text: SMS_SAMPLE_CONFIRMATION },
];

/**
 * The same thread with another shift code in the offer and the reply, for the hero's loop,
 * which shows a fresh code each time round. The words never change.
 */
export function threadWithCode(code: string): readonly SmsBubble[] {
  return SMS_SAMPLE_THREAD.map((bubble) => ({
    ...bubble,
    text: bubble.text.replace(SMS_SAMPLE_CODE, code),
  }));
}

/** A new four-digit shift code, never the one before it. */
export function nextShiftCode(previous: string, random: () => number = Math.random): string {
  for (;;) {
    const code = String(1000 + Math.floor(random() * 9000));
    if (code !== previous) return code;
  }
}

/** The thread's one-line description for screen readers. */
export const SMS_SAMPLE_THREAD_LABEL =
  "A sample text thread: FleetGrid sends a new shift, the driver replies YES with the code, and FleetGrid confirms the shift is booked.";
