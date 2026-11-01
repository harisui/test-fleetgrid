import { getServerEnv } from "@/lib/env";
import { isValidTwilioSignature } from "@/server/twilio/signature";

/** An empty TwiML answer: FleetGrid replies with its own texts, never inline. */
export const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export function twiml(status = 200): Response {
  return new Response(EMPTY_TWIML, { status, headers: { "content-type": "text/xml" } });
}

/**
 * Reads a Twilio webhook: the form parameters, checked against X-Twilio-Signature for the
 * exact public URL (decision D). Returns the parameters, or the refusal to send back.
 */
export async function readTwilioRequest(
  request: Request,
  publicUrl: string,
): Promise<{ params: Record<string, string> } | { refused: Response }> {
  const token = getServerEnv().TWILIO_AUTH_TOKEN;
  if (!token) return { refused: Response.json({ error: "Twilio is not set up" }, { status: 503 }) };
  const form = await request.formData().catch(() => null);
  if (!form) return { refused: Response.json({ error: "Bad request" }, { status: 400 }) };
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") params[key] = value;
  if (!isValidTwilioSignature(token, publicUrl, params, request.headers.get("x-twilio-signature"))) {
    return { refused: Response.json({ error: "Invalid signature" }, { status: 403 }) };
  }
  return { params };
}
