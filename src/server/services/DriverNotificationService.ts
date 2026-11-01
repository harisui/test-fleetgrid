import { isReminderWindow, quietHoursSendAt } from "@/lib/shifts/schedule";
import { APPROVED_TEXT, REMINDER_TEXT } from "@/lib/shifts/texts";
import type { IDriverNotificationRepository } from "@/server/repositories/DriverNotificationRepository";
import type { TextService } from "@/server/services/TextService";

/**
 * The two one-time driver texts (change request of 2026-11-01, approved by Annie), through
 * the same sender, log and quiet hours as the shift texts. The database decides who is due
 * and stamps each driver before the text goes, so neither is ever sent twice.
 */
export class DriverNotificationService {
  constructor(
    private readonly notifications: IDriverNotificationRepository,
    private readonly texts: TextService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The profile reminder, only between 10 AM and 7 PM Houston time. Returns how many went. */
  async sendDueReminders(): Promise<number> {
    if (!isReminderWindow(this.now())) return 0;
    const due = await this.notifications.claimReminders();
    for (const driver of due) {
      await this.texts.send({ ...driver, smsOptedOut: false }, "reminder", REMINDER_TEXT);
    }
    return due.length;
  }

  /**
   * An admin approved the driver: the approval text is queued once (now, or 7 AM at night)
   * and sent at once by day. Opted-out or non-consenting drivers get nothing (the database
   * checks). Never throws past the approval: the caller catches.
   */
  async onDriverApproved(driverId: string): Promise<void> {
    const later = quietHoursSendAt(this.now());
    const queued = await this.notifications.queueApprovalText(driverId, later?.toISOString() ?? null);
    if (queued && !later) await this.sendDueApprovalTexts(driverId);
  }

  /** Sends the approval texts that are due (the 7 AM cron sends the ones held overnight). */
  async sendDueApprovalTexts(driverId?: string): Promise<number> {
    const due = await this.notifications.claimApprovalTexts(driverId);
    for (const driver of due) {
      await this.texts.send({ ...driver, smsOptedOut: false }, "approved", APPROVED_TEXT);
    }
    return due.length;
  }
}
