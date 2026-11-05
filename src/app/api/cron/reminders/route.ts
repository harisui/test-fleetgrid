import { buildTextingServices } from "@/server/container";
import { refuseUnlessCron } from "@/server/cron";

/**
 * The one-time profile reminder (change request of 2026-11-01). Sends only between 10 AM and
 * 7 PM Houston time, whenever it runs: vercel.json runs it daily at 16:00 UTC (10 or 11 AM
 * Houston); on Vercel Pro, hourly ("0 * * * *").
 */
export async function GET(request: Request): Promise<Response> {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  const { notificationService, docReminderService } = buildTextingServices();
  const reminders = await notificationService.sendDueReminders();
  // The grace period for drivers approved before CR-5: moves anyone still incomplete when it ends.
  const graceExpired = await docReminderService.expireGrace();
  return Response.json({ ok: true, reminders, graceExpired });
}
