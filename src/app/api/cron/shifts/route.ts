import { buildTextingServices } from "@/server/container";
import { refuseUnlessCron } from "@/server/cron";

/**
 * The shifts job (vercel.json): marks open shifts nobody can book any more as expired
 * (T3.10; the pages already show them expired) and sends the broadcasts held for quiet hours
 * whose 7:00 AM has come, with the approval, welcome and documents texts held overnight. Scheduled at 7 AM Houston in both summer and winter time; on Vercel
 * Pro it can run every 15 minutes instead.
 */
export async function GET(request: Request): Promise<Response> {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  const { shifts, broadcastService, notificationService, noticeService, docReminderService, textService, drivers, inboundService } = buildTextingServices();
  const ended = await shifts.recordEnded();
  const expired = await shifts.expire();
  const dispatched = await broadcastService.dispatchDue();
  // Approval texts held overnight by quiet hours go at the same 7 AM run.
  const approvals = await notificationService.sendDueApprovalTexts();
  // So do admin notices held for quiet hours (CR-3).
  const notices = await noticeService.dispatchDue();
  // And the welcome and documents reminder texts held overnight (CR-5).
  const welcomes = await notificationService.sendDueWelcomeTexts();
  const docReminders = await docReminderService.dispatchDue();
  // Texts held while no real sender was set up.
  const held = await textService.drainHeld(drivers);
  // Anything a stopped server left behind.
  const resumed = await broadcastService.resumeQueued();
  const repliesHandled = await inboundService.reprocessUnfinished();
  return Response.json({ ok: true, ended, resumed, repliesHandled, expired, dispatched, approvals, notices, welcomes, docReminders, held });
}
