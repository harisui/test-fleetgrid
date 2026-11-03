import { docReminderText, DOC_REMINDER_ITEMS, type DocReminderItems } from "@/content/sms-samples";
import { quietHoursSendAt } from "@/lib/shifts/schedule";
import { docReminderItems } from "@/lib/sms/driverTexts";
import { smsSegments } from "@/lib/sms/segments";
import { docReminderPreviewSchema, sendDocReminderSchema } from "@/lib/validation/docReminder.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import type { DocReminderCandidate, IDriverNotificationRepository } from "@/server/repositories/DriverNotificationRepository";
import type { INoticeRepository } from "@/server/repositories/NoticeRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import { inBatches, SEND_CONCURRENCY } from "@/server/services/BroadcastService";
import type { TextService } from "@/server/services/TextService";
import type { NoticeBatch, Profile } from "@/types/domain";

export const DOC_REMINDER_DAYS = 3;

/** The batch row's text for a bulk send: each driver's own text names what they miss. */
export const DOC_REMINDER_TEMPLATE = docReminderText("{items}" as DocReminderItems);

export interface DocReminderPreview {
  /** The exact text for one driver; the template with {items} for a bulk send. */
  body: string;
  characters: number;
  segments: number;
  count: number;
  excluded: { optedOut: number; noConsent: number; recent: number };
  /** Bulk: how many get each wording. */
  byItems: Record<DocReminderItems, number>;
  /** At night: when it will go (7 AM Houston). */
  sendAfter: string | null;
  /** Why nothing can be sent, or null. */
  blocked: string | null;
  /** What the admin types to send a bulk reminder. */
  confirmPhrase: string;
}

/**
 * The missing-documents reminder (change request CR-5): to one driver from the sheet, or to
 * every Registered driver missing a document from the Drivers page. Fixed words only; each
 * driver's text names what they miss. At most one per driver per 3 days, consent and STOP
 * checked again as each text goes, held for quiet hours, recorded as a batch (Activity lists
 * it under Notices) and in the audit log. The bulk send needs the typed SEND {N}, recounted.
 */
export class DocReminderService {
  constructor(
    private readonly notifications: IDriverNotificationRepository,
    private readonly notices: INoticeRepository,
    private readonly profiles: IProfileRepository,
    private readonly writeAudit: (entry: AuditEntryInput) => Promise<unknown>,
    private readonly texts: TextService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async preview(adminId: string, input: unknown): Promise<DocReminderPreview> {
    await this.requireAdmin(adminId);
    const { driverId } = parseInput(docReminderPreviewSchema, input);
    return this.build(await this.notifications.docReminderCandidates(driverId ?? undefined), driverId ?? null);
  }

  async send(adminId: string, input: unknown): Promise<NoticeBatch> {
    const admin = await this.requireAdmin(adminId);
    const { driverId, confirm } = parseInput(sendDocReminderSchema, input);
    const candidates = await this.notifications.docReminderCandidates(driverId ?? undefined);
    const preview = this.build(candidates, driverId ?? null);
    if (preview.blocked) throw AppError.conflict(preview.blocked);
    if (!driverId && confirm.trim() !== preview.confirmPhrase) {
      throw AppError.validation("The list changed, or the words do not match. Check the count and type it again.", {
        confirm: `Type ${preview.confirmPhrase}`,
      });
    }

    const queue = preview.sendAfter !== null;
    const batch = await this.notices.insertBatch({
      category: "doc_reminder",
      variables: driverId ? { driverId } : {},
      body: preview.body,
      areaId: null,
      createdBy: admin.id,
      restoresBatchId: null,
      recipientCount: preview.count,
      excludedOptedOut: preview.excluded.optedOut,
      excludedNoConsent: preview.excluded.noConsent,
      excludedBlocked: 0,
      excludedRecent: preview.excluded.recent,
      sendAfter: preview.sendAfter,
    });
    await this.writeAudit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: queue ? "doc_reminder_queued" : "doc_reminder_sent",
      targetType: driverId ? "driver" : "notice_batch",
      targetId: driverId ?? batch.id,
      detail: { batchId: batch.id, recipients: preview.count, ...preview.byItems },
    });
    if (queue) return batch;
    await this.dispatch(batch.id);
    return (await this.notices.findBatch(batch.id)) ?? batch;
  }

  /**
   * Sends a batch. Each driver is claimed on its own: the database stamps the reminder only
   * if they are still Registered, consenting, not opted out, missing something and not
   * reminded in 3 days, and returns what they miss now.
   */
  async dispatch(batchId: string): Promise<number> {
    const batch = await this.notices.claimBatch(batchId);
    if (!batch) return 0;
    const driverIds = batch.variables.driverId
      ? [batch.variables.driverId]
      : (await this.notifications.docReminderCandidates()).filter((c) => c.exclusion === null).map((c) => c.driverId);
    let sent = 0;
    await inBatches(driverIds, SEND_CONCURRENCY, async (driverId) => {
      const claimed = await this.notifications.claimDocReminder(driverId);
      const items = claimed ? docReminderItems(claimed.missing) : null;
      if (!claimed || !items) return;
      sent += 1;
      await this.texts.send({ driverId, phone: claimed.phone, smsOptedOut: false }, "doc_reminder", docReminderText(items), {
        noticeBatchId: batch.id,
      });
    });
    await this.notices.finishBatch(batch.id, sent);
    return sent;
  }

  /** The 7 AM run: reminders held for quiet hours whose time has come. */
  async dispatchDue(): Promise<number> {
    const due = await this.notices.listDue(this.now().toISOString(), ["doc_reminder"]);
    let sent = 0;
    for (const batch of due) sent += await this.dispatch(batch.id);
    return sent;
  }

  private build(candidates: DocReminderCandidate[], driverId: string | null): DocReminderPreview {
    const targets = candidates.filter((c) => c.exclusion === null);
    const byItems = Object.fromEntries(DOC_REMINDER_ITEMS.map((items) => [items, 0])) as Record<DocReminderItems, number>;
    for (const target of targets) {
      const items = docReminderItems(target.missing);
      if (items) byItems[items] += 1;
    }
    const single = driverId ? candidates[0] : undefined;
    const singleItems = single ? docReminderItems(single.missing) : null;
    const body = driverId ? docReminderText(singleItems ?? "CDL photos and medical card") : DOC_REMINDER_TEMPLATE;
    // The longest wording sets the size of a bulk send.
    const { characters, segments } = smsSegments(driverId ? body : docReminderText("CDL photos and medical card"));
    const later = quietHoursSendAt(this.now());
    return {
      body,
      characters,
      segments,
      count: targets.length,
      excluded: {
        optedOut: candidates.filter((c) => c.exclusion === "opted_out").length,
        noConsent: candidates.filter((c) => c.exclusion === "no_consent").length,
        recent: candidates.filter((c) => c.exclusion === "recent").length,
      },
      byItems,
      sendAfter: later ? later.toISOString() : null,
      blocked: targets.length > 0 ? null : this.nobodyReason(driverId, single),
      confirmPhrase: `SEND ${targets.length}`,
    };
  }

  private nobodyReason(driverId: string | null, single: DocReminderCandidate | undefined): string {
    if (!driverId) return "No Registered driver missing documents can get a reminder now.";
    if (!single) return "This driver is not Registered with missing documents.";
    switch (single.exclusion) {
      case "opted_out":
        return "This driver replied STOP, so they cannot be texted.";
      case "no_consent":
        return "This driver has not agreed to texts.";
      default:
        return `A documents reminder went to this driver in the last ${DOC_REMINDER_DAYS} days.`;
    }
  }

  private async requireAdmin(adminId: string): Promise<Profile> {
    const profile = await this.profiles.findById(adminId);
    if (!profile || profile.role !== "admin" || profile.status === "blocked") {
      throw AppError.forbidden("Only admins can do this");
    }
    return profile;
  }
}
