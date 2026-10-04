// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SMS_CONSENT_TEXT } from "@/lib/constants";

/**
 * The consent wording is what the driver agreed to and what the stored record quotes. It is
 * fixed by US texting rules and changes only with a new consent version, never in passing.
 */
describe("SMS consent text", () => {
  it("is exactly the approved wording", () => {
    expect(SMS_CONSENT_TEXT).toBe(
      "I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.",
    );
  });

  it("names the program, the frequency, the rates, STOP and HELP", () => {
    for (const part of ["FleetGrid", "frequency varies", "data rates may apply", "STOP", "HELP"]) {
      expect(SMS_CONSENT_TEXT).toContain(part);
    }
  });
});
