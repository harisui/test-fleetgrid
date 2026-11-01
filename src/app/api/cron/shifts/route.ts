import { buildTextingServices } from "@/server/container";
import { refuseUnlessCron } from "@/server/cron";

/**
 * The shifts job (vercel.json): marks open shifts nobody can book any more as expired
 * (T3.10; the pages already show them expired) and sends the broadcasts held for quiet hours
 * whose 7:00 AM has come. Scheduled at 7 AM Houston in both summer and winter time; on Vercel
 * Pro it can run every 15 minutes instead.
 */
export async function GET(request: Request): Promise<Response> {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  const { shifts, broadcastService } = buildTextingServices();
  const expired = await shifts.expire();
  const dispatched = await broadcastService.dispatchDue();
  return Response.json({ ok: true, expired, dispatched });
}
