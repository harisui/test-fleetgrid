import { buildTextingServices } from "@/server/container";
import { refuseUnlessCron } from "@/server/cron";

/**
 * The shifts job (vercel.json): marks open shifts nobody can book any more as expired
 * (T3.10; the pages already show them expired) and sends the broadcasts held for quiet hours
 * whose 7:00 AM has come, with the approval texts held overnight. Scheduled at 7 AM Houston in both summer and winter time; on Vercel
 * Pro it can run every 15 minutes instead.
 */
export async function GET(request: Request): Promise<Response> {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  const { shifts, broadcastService, notificationService, noticeService } = buildTextingServices();
  const expired = await shifts.expire();
  const dispatched = await broadcastService.dispatchDue();
  // Approval texts held overnight by quiet hours go at the same 7 AM run.
  const approvals = await notificationService.sendDueApprovalTexts();
  // So do admin notices held for quiet hours (CR-3).
  const notices = await noticeService.dispatchDue();
  return Response.json({ ok: true, expired, dispatched, approvals, notices });
}
