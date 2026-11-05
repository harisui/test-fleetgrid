// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  SMS_APPROVED,
  SMS_REMINDER,
  SMS_SAMPLE_CONFIRMATION,
  SMS_SAMPLE_FILLED,
  SMS_SAMPLE_OFFER,
  SMS_SAMPLE_REPLY,
  SMS_WELCOME_NO_NAME,
  DOC_REMINDER_ITEMS,
  docReminderText,
  threadWithCode,
  welcomeText,
} from "@/content/sms-samples";
import { docReminderItems, WELCOME_NAME_MAX, welcomeFirstName } from "@/lib/sms/driverTexts";
import { smsSegments } from "@/lib/sms/segments";

/**
 * The three shift texts, word for word as revised for Twilio's toll-free review (rejection
 * 30468, 2026-10-29). Milestone 3 sends these; change them only together with Twilio.
 */
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
