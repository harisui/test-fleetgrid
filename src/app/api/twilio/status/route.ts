import { buildTextingServices } from "@/server/container";
import { TWILIO_STATUS_URL } from "@/server/twilio/signature";
import { readTwilioRequest } from "@/server/twilio/webhook";

/** Delivery reports for every text FleetGrid sends (the status callback URL on each send). */
export async function POST(request: Request): Promise<Response> {
  const read = await readTwilioRequest(request, TWILIO_STATUS_URL);
  if ("refused" in read) return read.refused;
  const { params } = read;
  if (!params.MessageSid || !params.MessageStatus) return Response.json({ error: "Bad request" }, { status: 400 });
  await buildTextingServices().inboundService.handleStatus({
    sid: params.MessageSid,
    status: params.MessageStatus,
    errorCode: params.ErrorCode ?? null,
  });
  return new Response(null, { status: 204 });
}
