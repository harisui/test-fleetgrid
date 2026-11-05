import { describe, expect, it } from "vitest";
import { SmsSendError, TwilioSmsProvider } from "@/server/providers/SmsProvider";
import { isValidTwilioSignature, twilioSignature } from "@/server/twilio/signature";

/**
 * Twilio's wiring without real phones (Artifacts/simulator.md, part 3). The signature fixture runs
 * always. The contract runs only with TWILIO_TEST_ACCOUNT_SID and TWILIO_TEST_AUTH_TOKEN, Twilio's
 * test credentials, which send nothing and cost nothing. They refuse a Messaging Service, so the
 * request's sender is swapped for Twilio's magic From number; everything else is what production sends.
 */
const TEST_SID = process.env.TWILIO_TEST_ACCOUNT_SID;
const TEST_TOKEN = process.env.TWILIO_TEST_AUTH_TOKEN;
const MAGIC_FROM = "+15005550006";

const withMagicFrom: typeof fetch = (input, init) => {
  const body = new URLSearchParams(init?.body as URLSearchParams);
  body.delete("MessagingServiceSid");
  body.set("From", MAGIC_FROM);
  return fetch(input, { ...init, body });
};

describe("Twilio wiring", () => {
  // The worked example at twilio.com/docs/usage/security, with the signature it gives.
  const FIXTURE = {
    token: "12345",
    url: "https://example.com/myapp.php?foo=1&bar=2",
    params: { CallSid: "CA1234567890ABCDE", Caller: "+14158675310", Digits: "1234", From: "+14158675310", To: "+18005551212" },
    signature: "L/OH5YylLD5NRKLltdqwSvS0BnU=",
  };

  it("our signature matches Twilio's published example", () => {
    expect(twilioSignature(FIXTURE.token, FIXTURE.url, FIXTURE.params)).toBe(FIXTURE.signature);
    expect(isValidTwilioSignature(FIXTURE.token, FIXTURE.url, FIXTURE.params, FIXTURE.signature)).toBe(true);
  });

  it("a changed parameter, URL or token fails the check", () => {
    const { token, url, params, signature } = FIXTURE;
    expect(isValidTwilioSignature(token, url, { ...params, Digits: "9999" }, signature)).toBe(false);
    expect(isValidTwilioSignature(token, `${url}&x=1`, params, signature)).toBe(false);
    expect(isValidTwilioSignature("54321", url, params, signature)).toBe(false);
    expect(isValidTwilioSignature(token, url, params, null)).toBe(false);
  });

  describe.skipIf(!TEST_SID || !TEST_TOKEN)("with Twilio's test credentials", () => {
    const provider = () => new TwilioSmsProvider(TEST_SID!, TEST_TOKEN!, "MGunused", withMagicFrom);

    it("a good number is accepted and gets a message id", async () => {
      const sent = await provider().send({ to: "+15005550006", body: "FleetGrid: wiring check." });
      expect(sent.sid).toMatch(/^SM/);
    });

    it("a bad number comes back as a refusal with Twilio's code", async () => {
      const refused = await provider().send({ to: "+15005550001", body: "FleetGrid: wiring check." }).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(SmsSendError);
      expect((refused as SmsSendError).code).toBe("21211");
    });
  });
});
