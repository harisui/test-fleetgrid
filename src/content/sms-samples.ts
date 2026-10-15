/**
 * The sample shift texts shown on the site (hero, carriers, drivers pages).
 *
 * Bubble 1 is exactly the sample message submitted to Twilio for the toll-free review
 * (client, 2026-10-14). Milestone 3 must send this same template. Bubbles 2 and 3 are
 * drafts of the reply and the confirmation.
 * verify: "milestone-3-template"
 */

export interface SmsBubble {
  direction: "in" | "out";
  text: string;
}

/** The shift code in the sample: each broadcast carries its own, and the reply names it. */
export const SMS_SAMPLE_CODE = "4821";

export const SMS_SAMPLE_OFFER =
  "FleetGrid: CDL-A driver needed, Pasadena TX, Tue Oct 14 6:00 AM. Reply YES 4821 to claim. First to reply gets it. Reply STOP to opt out.";

export const SMS_SAMPLE_REPLY = "YES 4821";

export const SMS_SAMPLE_CONFIRMATION =
  "FleetGrid: Confirmed. The shift is yours. The carrier will contact you with details.";

export const SMS_SAMPLE_FILLED =
  "FleetGrid: That shift was just filled by another driver. We will text you the next one that matches.";

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
  "A sample text thread: FleetGrid offers a shift, the driver replies YES with the code, FleetGrid confirms the shift is theirs.";
