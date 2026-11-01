import { buildTextingServices } from "@/server/container";
import { TWILIO_INBOUND_URL } from "@/server/twilio/signature";
import { readTwilioRequest, twiml } from "@/server/twilio/webhook";

/**
 * Replies texted to the FleetGrid number (T3.6), set as the Messaging Service's inbound URL
 * https://fleetgridus.com/api/twilio/inbound. Signed by Twilio, handled once per MessageSid,
 * every message logged. Answers with empty TwiML: replies go out as their own texts, and
 * Twilio's Advanced Opt-Out answers STOP, START and HELP itself.
 */
export async function POST(request: Request): Promise<Response> {
  const read = await readTwilioRequest(request, TWILIO_INBOUND_URL);
  if ("refused" in read) return read.refused;
  const { params } = read;
  if (!params.MessageSid || !params.From) return twiml(400);
  await buildTextingServices().inboundService.handle({
    sid: params.MessageSid,
    from: params.From,
    to: params.To ?? "",
    body: params.Body ?? "",
    optOutType: params.OptOutType ?? null,
  });
  return twiml();
}
