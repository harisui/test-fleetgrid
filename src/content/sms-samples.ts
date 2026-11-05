/**
 * The sample shift texts shown on the site (hero, carriers, drivers pages).
 *
 * The three templates in first-party words, exactly as revised for Twilio's toll-free review
 * (rejection 30468, 2026-10-29): FleetGrid itself posts the shift and books it, so nothing
 * reads like a third party passing leads on. Milestone 3 must send these same texts; the
 * place, date and code are the variables.
 * verify: "milestone-3-template"
 */

import { ROSTER_READY } from "@/lib/drivers/tiers";

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

/**
 * The two one-time driver texts (change request of 2026-11-01, approved by Annie), word for
 * word. They have no variables.
 */
/** Reminder: once, to a consenting driver whose card is unfinished and idle for 24 hours. */
export const SMS_REMINDER =
  "FleetGrid: Your driver profile is almost done. Finish it to get shift texts: fleetgridus.com/driver. Reply STOP to opt out.";

/** Roster-Ready: once, to a consenting driver when an admin marks them (wording agreed 2026-11-05). */
export const SMS_APPROVED =
  `FleetGrid: Your profile is ${ROSTER_READY}. You'll get texts when matching shifts open. Reply STOP to opt out.`;

/**
 * The answers to a YES that books nothing (wording agreed 2026-11-05), word for word, so no
 * reply is ever met with silence.
 */
export const SMS_OVERLAP =
  "FleetGrid: You already have a shift booked at that time, so this one wasn't booked. Reply HELP for help.";
export const SMS_PAUSED =
  "FleetGrid: Your shift offers are paused, so this shift wasn't booked. Reply HELP or email support@fleetgridus.com.";
export const SMS_NOT_ELIGIBLE = "FleetGrid: This shift isn't open to you, so it wasn't booked. Reply HELP for help.";
export const SMS_ALREADY_BOOKED = "FleetGrid: You're already booked for this shift. Details at fleetgridus.com/driver.";

/**
 * The Shift-Ready texts (change request CR-5, approved by Annie 2026-11-03), word for word.
 */
/** Welcome: once per phone number ever, right after the first screen, with consent. */
export function welcomeText(firstName: string | null): string {
  return firstName
    ? `FleetGrid: Thanks for signing up, ${firstName}. Upload your CDL and medical card at fleetgridus.com/driver to start getting shift offers. Reply STOP to opt out.`
    : SMS_WELCOME_NO_NAME;
}

/** The welcome when the first name is missing, too long or not plain GSM-7 (decision 5). */
export const SMS_WELCOME_NO_NAME =
  "FleetGrid: Thanks for signing up. Upload your CDL and medical card at fleetgridus.com/driver to start getting shift offers. Reply STOP to opt out.";

/** The missing documents, as the reminder names them: only these three wordings. */
export const DOC_REMINDER_ITEMS = ["CDL photos", "medical card", "CDL photos and medical card"] as const;
export type DocReminderItems = (typeof DOC_REMINDER_ITEMS)[number];

/** Missing documents: from an admin, at most once per 3 days. */
export function docReminderText(items: DocReminderItems): string {
  return `FleetGrid: To start getting shift offers, please upload your ${items} at fleetgridus.com/driver. Reply STOP to opt out.`;
}

/**
 * One text to a driver in the grace period who has not said which state issued their CDL
 * (wording agreed 2026-11-05). With documents missing too, one combined text.
 */
export function cdlStateNoticeText(date: string, items: DocReminderItems | null): string {
  return items
    ? `FleetGrid: Confirm your CDL state and upload your ${items} at fleetgridus.com/driver by ${date} to get shift offers. Reply STOP to opt out.`
    : `FleetGrid: Please confirm the state that issued your CDL at fleetgridus.com/driver by ${date} to get shift offers. Reply STOP to opt out.`;
}

/**
 * Admin notices (change request CR-3, 2026-11-01). Account notifications under the approved
 * toll-free use case (TWO_FACTOR_AUTHENTICATION, ACCOUNT_NOTIFICATIONS), never marketing.
 * The admin only picks from these lists; nothing typed reaches a text. The verb agrees with
 * the noun (user decision of 2026-11-01).
 */
export const NOTICE_POLICIES = {
  terms: { label: "Terms of Service", verb: "change", link: "fleetgridus.com/terms" },
  privacy: { label: "Privacy Policy", verb: "changes", link: "fleetgridus.com/privacy" },
  sms_terms: { label: "SMS Terms", verb: "change", link: "fleetgridus.com/sms-terms" },
} as const;
export type NoticePolicy = keyof typeof NOTICE_POLICIES;

export const NOTICE_SERVICES = {
  shift_texts: { label: "Shift texts", verb: "are" },
  logins: { label: "Logins", verb: "are" },
  website: { label: "The website", verb: "is" },
} as const;
export type NoticeService = keyof typeof NOTICE_SERVICES;

export const NOTICE_STATES = { delayed: "delayed", unavailable: "unavailable" } as const;
export type NoticeState = keyof typeof NOTICE_STATES;

/** Policy change: "FleetGrid: Our Privacy Policy changes on Nov 15, 2026. Read it at fleetgridus.com/privacy. Reply STOP to opt out." */
export function policyChangeText(policy: NoticePolicy, date: string): string {
  const { label, verb, link } = NOTICE_POLICIES[policy];
  return `FleetGrid: Our ${label} ${verb} on ${date}. Read it at ${link}. Reply STOP to opt out.`;
}

/** Service notice: "FleetGrid: Logins are delayed until about 3:00 PM. We'll text you when it's fixed. Reply STOP to opt out." */
export function serviceNoticeText(service: NoticeService, state: NoticeState, time: string): string {
  const { label, verb } = NOTICE_SERVICES[service];
  return `FleetGrid: ${label} ${verb} ${NOTICE_STATES[state]} until about ${time}. We'll text you when it's fixed. Reply STOP to opt out.`;
}

/** Service restored (the STOP line added by the user's decision of 2026-11-01). */
export function serviceRestoredText(service: NoticeService): string {
  const { label, verb } = NOTICE_SERVICES[service];
  return `FleetGrid: ${label} ${verb} working again. Thanks for your patience. Reply STOP to opt out.`;
}

/** Account security, to one driver. */
export const SMS_ACCOUNT_SECURITY =
  "FleetGrid: We noticed unusual activity on your account. Please log in at fleetgridus.com/driver or reply HELP.";

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
