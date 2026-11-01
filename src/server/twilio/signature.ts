import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio's request signature (X-Twilio-Signature): base64 HMAC-SHA1, keyed with the auth
 * token, of the full URL followed by every POST parameter, sorted by name, as name then value.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

/** True when the signature matches. Compared in constant time. */
export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * The exact public addresses Twilio is told to call (decision D, 2026-11-01): the apex
 * domain, never www and never a preview, so a signature is only ever checked against these.
 */
export const TWILIO_PUBLIC_ORIGIN = "https://fleetgridus.com";
export const TWILIO_INBOUND_URL = `${TWILIO_PUBLIC_ORIGIN}/api/twilio/inbound`;
export const TWILIO_STATUS_URL = `${TWILIO_PUBLIC_ORIGIN}/api/twilio/status`;
