// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SMS_ALREADY_BOOKED,
  SMS_APPROVED,
  SMS_NOT_ELIGIBLE,
  SMS_OVERLAP,
  SMS_PAUSED,
  SMS_REMINDER,
  SMS_SAMPLE_CONFIRMATION,
  SMS_SAMPLE_FILLED,
  SMS_SAMPLE_OFFER,
  SMS_SAMPLE_REPLY,
  SMS_WELCOME_NO_NAME,
  SMS_ACCOUNT_SECURITY,
  SMS_TWIC_DATE,
  cdlStateNoticeText,
  DOC_REMINDER_ITEMS,
  docReminderText,
  NOTICE_POLICIES,
  NOTICE_SERVICES,
  NOTICE_STATES,
  policyChangeText,
  serviceNoticeText,
  serviceRestoredText,
  threadWithCode,
  welcomeText,
  type NoticePolicy,
  type NoticeService,
  type NoticeState,
} from "@/content/sms-samples";
import { ALREADY_BOOKED_TEXT, APPROVED_TEXT, bookedText, cancelledText, CLOSED_TEXT, FILLED_TEXT, FORMAT_HELP_TEXT, NO_OFFER_TEXT, NOT_ELIGIBLE_TEXT, offerText, OVERLAP_TEXT, PAUSED_TEXT, REMINDER_TEXT } from "@/lib/shifts/texts";
import { docReminderItems, WELCOME_NAME_MAX, welcomeFirstName } from "@/lib/sms/driverTexts";
import { smsSegments } from "@/lib/sms/segments";

/**
 * The three shift texts, word for word as revised for Twilio's toll-free review (rejection
 * 30468, 2026-10-29). Milestone 3 sends these; change them only together with Twilio.
 */
/** Every text the app can send, each wording filled with the longest values it can take. */
function everyTemplate(): Record<string, string> {
  const longest = { cdlClass: "A" as const, city: "Pasadena", state: "TX", startsAt: "2026-09-30T17:00:00.000Z" };
  const templates: Record<string, string> = {
    offer: offerText(longest, "4821"),
    booked: bookedText(longest),
    bookedLongCity: bookedText({ ...longest, city: "South Houston" }),
    cancelled: cancelledText(longest),
    filled: FILLED_TEXT,
    closed: CLOSED_TEXT,
    formatHelp: FORMAT_HELP_TEXT,
    noOffer: NO_OFFER_TEXT,
    overlap: OVERLAP_TEXT,
    paused: PAUSED_TEXT,
    notEligible: NOT_ELIGIBLE_TEXT,
    alreadyBooked: ALREADY_BOOKED_TEXT,
    approved: APPROVED_TEXT,
    reminder: REMINDER_TEXT,
    twicDate: SMS_TWIC_DATE,
    security: SMS_ACCOUNT_SECURITY,
    welcome: welcomeText("Christopher"),
    welcomeNoName: SMS_WELCOME_NO_NAME,
    cdlStateOnly: cdlStateNoticeText("Sep 30", null),
  };
  for (const items of DOC_REMINDER_ITEMS) {
    templates[`docReminder ${items}`] = docReminderText(items);
    templates[`cdlState ${items}`] = cdlStateNoticeText("Sep 30", items);
  }
  for (const policy of Object.keys(NOTICE_POLICIES) as NoticePolicy[]) templates[`policy ${policy}`] = policyChangeText(policy, "Sep 30, 2026");
  for (const service of Object.keys(NOTICE_SERVICES) as NoticeService[]) {
    templates[`restored ${service}`] = serviceRestoredText(service);
    for (const state of Object.keys(NOTICE_STATES) as NoticeState[]) templates[`notice ${service} ${state}`] = serviceNoticeText(service, state, "12:00 PM");
  }
  return templates;
}

describe("every text is plain GSM-7 (user, 2026-11-05)", () => {
  it.each(Object.entries(everyTemplate()))("%s stays GSM-7 and one segment", (_name, text) => {
    expect(smsSegments(text)).toMatchObject({ encoding: "GSM-7", segments: 1 });
  });

  it.each(["src/content/sms-samples.ts", "src/lib/shifts/texts.ts"])("%s has no curly quote or other typographic character", (file) => {
    // A curly apostrophe switches the whole text to Unicode and halves its length.
    const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(source.match(/[\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u00A0]/g)).toBeNull();
  });
});

describe("the SMS templates (Twilio 30468)", () => {
  it("are the exact first-party texts", () => {
    expect(SMS_SAMPLE_OFFER).toBe(
      "FleetGrid: New shift on FleetGrid for CDL-A drivers. Pasadena TX, Tue Oct 14 6:00 AM. Reply YES 4821 to book it. Reply STOP to opt out.",
    );
    expect(SMS_SAMPLE_CONFIRMATION).toBe(
      "FleetGrid: Your shift is booked. CDL-A, Pasadena TX, Tue Oct 14 6:00 AM. See details in your FleetGrid account: fleetgridus.com/driver. Reply HELP for help.",
    );
    expect(SMS_SAMPLE_FILLED).toBe(
      "FleetGrid: This shift is already booked. We'll text you about the next matching shift. Reply STOP to opt out.",
    );
    expect(SMS_SAMPLE_REPLY).toBe("YES 4821");
  });

  it("never say first to reply, claim, connect or leads", () => {
    for (const text of [SMS_SAMPLE_OFFER, SMS_SAMPLE_CONFIRMATION, SMS_SAMPLE_FILLED]) {
      expect(text).not.toMatch(/first to reply|gets it|claim|connect|\bleads?\b/i);
      expect(text.startsWith("FleetGrid: ")).toBe(true);
    }
  });

  it("keep the code a variable: another code changes only the code", () => {
    const [offer, reply] = threadWithCode("7310");
    expect(offer.text).toBe(SMS_SAMPLE_OFFER.replace("4821", "7310"));
    expect(reply.text).toBe("YES 7310");
  });
});

describe("the one-time driver texts (change request of 2026-11-01, approved by Annie)", () => {
  it("are word for word and fit one text", () => {
    expect(SMS_REMINDER).toBe(
      "FleetGrid: Your driver profile is almost done. Finish it to get shift texts: fleetgridus.com/driver. Reply STOP to opt out.",
    );
    expect(SMS_APPROVED).toBe(
      "FleetGrid: Your profile is Roster-Ready. You'll get texts when matching shifts open. Reply STOP to opt out.",
    );
    for (const text of [SMS_REMINDER, SMS_APPROVED]) expect(text.length).toBeLessThan(160);
  });
});

describe("the Roster-Ready texts (change request CR-5, approved by Annie 2026-11-03)", () => {
  it("are word for word", () => {
    expect(welcomeText("Maria")).toBe(
      "FleetGrid: Thanks for signing up, Maria. Upload your CDL and medical card at fleetgridus.com/driver to start getting shift offers. Reply STOP to opt out.",
    );
    expect(welcomeText(null)).toBe(SMS_WELCOME_NO_NAME);
    expect(SMS_WELCOME_NO_NAME).toBe(
      "FleetGrid: Thanks for signing up. Upload your CDL and medical card at fleetgridus.com/driver to start getting shift offers. Reply STOP to opt out.",
    );
    expect(docReminderText("CDL photos")).toBe(
      "FleetGrid: To start getting shift offers, please upload your CDL photos at fleetgridus.com/driver. Reply STOP to opt out.",
    );
    expect(DOC_REMINDER_ITEMS).toEqual(["CDL photos", "medical card", "CDL photos and medical card"]);
  });

  it("are GSM-7 and under 160, with the longest first name the welcome allows", () => {
    const texts = [
      welcomeText("A".repeat(WELCOME_NAME_MAX)),
      SMS_WELCOME_NO_NAME,
      ...DOC_REMINDER_ITEMS.map((items) => docReminderText(items)),
    ];
    for (const text of texts) {
      expect(smsSegments(text).encoding, text).toBe("GSM-7");
      expect(smsSegments(text).characters, text).toBeLessThan(160);
      expect(text.startsWith("FleetGrid: "), text).toBe(true);
      expect(text.endsWith("Reply STOP to opt out."), text).toBe(true);
      expect(text).not.toMatch(/verified/i);
    }
  });

  it("the answers to a YES that books nothing are word for word, GSM-7 and under 160", () => {
    expect(SMS_OVERLAP).toBe("FleetGrid: You already have a shift booked at that time, so this one wasn't booked. Reply HELP for help.");
    expect(SMS_PAUSED).toBe("FleetGrid: Your shift offers are paused, so this shift wasn't booked. Reply HELP or email support@fleetgridus.com.");
    expect(SMS_NOT_ELIGIBLE).toBe("FleetGrid: This shift isn't open to you, so it wasn't booked. Reply HELP for help.");
    expect(SMS_ALREADY_BOOKED).toBe("FleetGrid: You're already booked for this shift. Details at fleetgridus.com/driver.");
    for (const text of [SMS_OVERLAP, SMS_PAUSED, SMS_NOT_ELIGIBLE, SMS_ALREADY_BOOKED]) {
      expect(smsSegments(text).encoding, text).toBe("GSM-7");
      expect(smsSegments(text).characters, text).toBeLessThan(160);
    }
  });

  it("the CDL-state text is GSM-7 and under 160 in every form, with the longest date", () => {
    for (const items of [null, ...DOC_REMINDER_ITEMS]) {
      const text = cdlStateNoticeText("Nov 30", items);
      expect(smsSegments(text).encoding, text).toBe("GSM-7");
      expect(smsSegments(text).characters, text).toBeLessThan(160);
      expect(text.startsWith("FleetGrid: "), text).toBe(true);
      expect(text.endsWith("Reply STOP to opt out."), text).toBe(true);
    }
  });

  it("leave the name out when it is missing, too long or not GSM-7", () => {
    expect(welcomeFirstName("Maria Lopez")).toBe("Maria");
    expect(welcomeFirstName("  Jo   Ann ")).toBe("Jo");
    expect(welcomeFirstName("A".repeat(WELCOME_NAME_MAX))).toBe("A".repeat(WELCOME_NAME_MAX));
    expect(welcomeFirstName("A".repeat(WELCOME_NAME_MAX + 1))).toBeNull();
    expect(welcomeFirstName("Łukasz Nowak")).toBeNull();
    expect(welcomeFirstName("😀 Smith")).toBeNull();
    expect(welcomeFirstName("")).toBeNull();
    expect(welcomeFirstName(null)).toBeNull();
  });

  it("name the missing documents only from the checklist", () => {
    expect(docReminderItems(["cdl_front"])).toBe("CDL photos");
    expect(docReminderItems(["cdl_back"])).toBe("CDL photos");
    expect(docReminderItems(["cdl_front", "cdl_back"])).toBe("CDL photos");
    expect(docReminderItems(["medical_card"])).toBe("medical card");
    expect(docReminderItems(["cdl_back", "medical_card"])).toBe("CDL photos and medical card");
    expect(docReminderItems(["cdl_state", "last_name", "profile"])).toBeNull();
    expect(docReminderItems([])).toBeNull();
  });
});
