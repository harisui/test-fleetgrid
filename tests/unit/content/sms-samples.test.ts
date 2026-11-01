// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  SMS_APPROVED,
  SMS_REMINDER,
  SMS_SAMPLE_CONFIRMATION,
  SMS_SAMPLE_FILLED,
  SMS_SAMPLE_OFFER,
  SMS_SAMPLE_REPLY,
  threadWithCode,
} from "@/content/sms-samples";

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
      "FleetGrid: Your profile is approved. You'll get texts when matching shifts open. Reply STOP to opt out.",
    );
    for (const text of [SMS_REMINDER, SMS_APPROVED]) expect(text.length).toBeLessThan(160);
  });
});
