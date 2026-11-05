import { buildTextingServices } from "@/server/container";
import { refuseUnlessCron } from "@/server/cron";

/**
 * What a stopped server left behind: alerts still queued and replies never finished, each older
 * than 2 minutes. Meant to run every few minutes, which Vercel Hobby does not allow, so it is not
 * in vercel.json: the 7 AM shifts job runs the same steps until a faster schedule is chosen.
 */
export async function GET(request: Request): Promise<Response> {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  const { broadcastService, inboundService } = buildTextingServices();
  const resumed = await broadcastService.resumeQueued();
  const repliesHandled = await inboundService.reprocessUnfinished();
  return Response.json({ ok: true, resumed, repliesHandled });
}
