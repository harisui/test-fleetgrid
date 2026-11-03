import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  NOTICE_SERVICES,
  SMS_ACCOUNT_SECURITY,
  policyChangeText,
  serviceNoticeText,
  serviceRestoredText,
  type NoticePolicy,
  type NoticeService as NoticeServiceKey,
  type NoticeState,
} from "@/content/sms-samples";
import { SMS_SEGMENT_COST_ESTIMATE_USD } from "@/lib/constants";
import { quietHoursSendAt } from "@/lib/shifts/schedule";
import { SHIFT_TIME_ZONE } from "@/lib/shifts/texts";
import { smsSegments } from "@/lib/sms/segments";
import {
  driverSearchQuerySchema,
  NOTICE_CATEGORIES,
  noticeChoicesSchema,
  sendNoticeSchema,
  type NoticeChoices,
} from "@/lib/validation/notice.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import type { DriverChoice, INoticeRepository, NoticeCandidate } from "@/server/repositories/NoticeRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import { inBatches, SEND_CONCURRENCY } from "@/server/services/BroadcastService";
import type { TextService } from "@/server/services/TextService";
import type { NoticeBatch, Profile, ServiceArea } from "@/types/domain";

const DAY = 24 * 60 * 60 * 1000;
export const POLICY_NOTICE_DAYS = 60;
export const POLICY_LIMIT_DAYS = 7;
export const SERVICE_NOTICES_PER_DAY = 3;
export const RESTORE_WINDOW_HOURS = 48;

export interface NoticeRecipients {
  count: number;
  excluded: { optedOut: number; noConsent: number; blocked: number };
  /** The one driver of a security notice. */
  driver: { driverId: string; fullName: string } | null;
}

export interface NoticePreview {
  body: string;
  characters: number;
  segments: number;
  /** About this many dollars: count times segments times SMS_SEGMENT_COST_ESTIMATE_USD. */
  estimatedCost: number;
  recipients: NoticeRecipients;
  /** At night: when it will go (7 AM Houston), unless sent now where that is allowed. */
  sendAfter: string | null;
  /** Service and security notices may go at night with a warning; policy changes never. */
  canSendNow: boolean;
  /** Why it cannot be sent now (a limit, nobody to send to), or null. */
  blocked: string | null;
  /** What the admin types to send a bulk notice. */
  confirmPhrase: string;
}

export interface RestorableNotice {
  batchId: string;
  service: NoticeServiceKey;
  label: string;
  sentAt: string;
}

export interface NoticeOptions {
  areas: ServiceArea[];
  restorable: RestorableNotice[];
  policyBlocked: string | null;
  serviceBlocked: string | null;
  /** The earliest and latest policy-change dates (Houston). */
  minDate: string;
  maxDate: string;
}

interface Built {
  body: string;
  variables: Record<string, string>;
  areaId: string | null;
  restoresBatchId: string | null;
  bulk: boolean;
}

/**
 * Send notice (change request CR-3): account notifications to drivers, never marketing, in
 * template words only. The server rebuilds the text from the choices, recounts the drivers,
 * checks the typed SEND {N}, the limits and quiet hours, records the batch and the audit
 * entry, and sends through the one sending path, ten at a time. A queued batch is checked
 * again when the 7 AM run sends it.
 */
export class NoticeService {
  constructor(
    private readonly notices: INoticeRepository,
    private readonly profiles: IProfileRepository,
    private readonly writeAudit: (entry: AuditEntryInput) => Promise<unknown>,
    private readonly texts: TextService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getOptions(adminId: string): Promise<NoticeOptions> {
    await this.requireAdmin(adminId);
    const now = this.now();
    const [areas, restorable, policyBlocked, serviceBlocked] = await Promise.all([
      this.notices.listActiveAreas(),
      this.restorable(),
      this.policyLimit(),
      this.serviceLimit(),
    ]);
    return {
      areas,
      restorable,
      policyBlocked,
      serviceBlocked,
      minDate: this.houstonDate(now),
      maxDate: this.houstonDate(new Date(now.getTime() + POLICY_NOTICE_DAYS * DAY)),
    };
  }

  async searchDrivers(adminId: string, input: unknown): Promise<DriverChoice[]> {
    await this.requireAdmin(adminId);
    const { query } = parseInput(driverSearchQuerySchema, input);
    return this.notices.searchDrivers(query);
  }

  /** The driver the sheet's "Send security notice" names, or null for a bad id. */
  async findDriverChoice(adminId: string, driverId: string): Promise<DriverChoice | null> {
    await this.requireAdmin(adminId);
    if (!/^[0-9a-f-]{36}$/i.test(driverId)) return null;
    return this.notices.findDriver(driverId);
  }

  async preview(adminId: string, input: unknown): Promise<NoticePreview> {
    await this.requireAdmin(adminId);
    const choices = parseInput(noticeChoicesSchema, input);
    const built = await this.build(choices);
    const { recipients, targets } = await this.recipients(choices, built);
    const { characters, segments } = smsSegments(built.body);
    const canSendNow = choices.category === "service_notice" || choices.category === "account_security";
    const later = quietHoursSendAt(this.now());
    const sendNow = "sendNow" in choices && choices.sendNow;
    return {
      body: built.body,
      characters,
      segments,
      estimatedCost: Math.round(targets.length * segments * SMS_SEGMENT_COST_ESTIMATE_USD * 100) / 100,
      recipients,
      sendAfter: later && !(canSendNow && sendNow) ? later.toISOString() : null,
      canSendNow,
      blocked: (await this.limitFor(choices)) ?? (targets.length === 0 ? this.nobodyReason(choices) : null),
      confirmPhrase: `SEND ${targets.length}`,
    };
  }

  async send(adminId: string, input: unknown): Promise<NoticeBatch> {
    const admin = await this.requireAdmin(adminId);
    const { choices, confirm } = parseInput(sendNoticeSchema, input);
    const built = await this.build(choices);
    const limit = await this.limitFor(choices);
    if (limit) throw AppError.conflict(limit);
    const { recipients, targets } = await this.recipients(choices, built);
    if (targets.length === 0) throw AppError.conflict(this.nobodyReason(choices));
    if (confirm.trim() !== `SEND ${targets.length}`) {
      throw AppError.validation("The list changed, or the words do not match. Check the count and type it again.", {
        confirm: `Type SEND ${targets.length}`,
      });
    }

    const later = quietHoursSendAt(this.now());
    const canSendNow = choices.category === "service_notice" || choices.category === "account_security";
    const queue = later !== null && !(canSendNow && "sendNow" in choices && choices.sendNow);
    const batch = await this.notices.insertBatch({
      category: choices.category,
      variables: built.variables,
      body: built.body,
      areaId: built.areaId,
      createdBy: admin.id,
      restoresBatchId: built.restoresBatchId,
      recipientCount: targets.length,
      excludedOptedOut: recipients.excluded.optedOut,
      excludedNoConsent: recipients.excluded.noConsent,
      excludedBlocked: recipients.excluded.blocked,
      sendAfter: queue ? later.toISOString() : null,
    });
    await this.writeAudit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: queue ? "notice_queued" : "notice_sent",
      targetType: "notice_batch",
      targetId: batch.id,
      detail: { category: choices.category, recipients: targets.length, ...built.variables },
    });
    if (queue) return batch;
    await this.dispatch(batch.id);
    return (await this.notices.findBatch(batch.id)) ?? batch;
  }

  /** Sends a batch: every driver is checked again now, and only eligible ones are texted. */
  async dispatch(batchId: string): Promise<number> {
    const batch = await this.notices.claimBatch(batchId);
    if (!batch) return 0;
    let targets: { driverId: string; phone: string }[];
    if (batch.category === "account_security") {
      const driver = batch.variables.driverId ? await this.notices.findDriver(batch.variables.driverId) : null;
      targets = driver && this.eligible(driver) ? [driver] : [];
    } else {
      targets = (await this.notices.candidates(batch.areaId)).filter((c) => c.exclusion === null);
    }
    const kind = batch.category === "account_security" ? "security" : "notice";
    await inBatches(targets, SEND_CONCURRENCY, async (target) => {
      await this.texts.send({ ...target, smsOptedOut: false }, kind, batch.body, { noticeBatchId: batch.id });
    });
    await this.notices.finishBatch(batch.id, targets.length);
    return targets.length;
  }

  /** The 7 AM run: batches held for quiet hours whose time has come. */
  async dispatchDue(): Promise<number> {
    const due = await this.notices.listDue(this.now().toISOString(), [...NOTICE_CATEGORIES]);
    let sent = 0;
    for (const batch of due) sent += await this.dispatch(batch.id);
    return sent;
  }

  private async build(choices: NoticeChoices): Promise<Built> {
    switch (choices.category) {
      case "policy_change": {
        const now = this.now();
        if (choices.date < this.houstonDate(now) || choices.date > this.houstonDate(new Date(now.getTime() + POLICY_NOTICE_DAYS * DAY))) {
          throw AppError.validation(undefined, { date: `Pick a date from today to ${POLICY_NOTICE_DAYS} days ahead` });
        }
        const pretty = formatInTimeZone(fromZonedTime(`${choices.date}T12:00:00`, SHIFT_TIME_ZONE), SHIFT_TIME_ZONE, "MMM d, yyyy");
        return {
          body: policyChangeText(choices.policy as NoticePolicy, pretty),
          variables: { policy: choices.policy, date: choices.date },
          areaId: choices.areaId,
          restoresBatchId: null,
          bulk: true,
        };
      }
      case "service_notice": {
        const pretty = formatInTimeZone(fromZonedTime(`2026-01-01T${choices.time}:00`, SHIFT_TIME_ZONE), SHIFT_TIME_ZONE, "h:mm a");
        return {
          body: serviceNoticeText(choices.service as NoticeServiceKey, choices.state as NoticeState, pretty),
          variables: { service: choices.service, state: choices.state, time: choices.time },
          areaId: choices.areaId,
          restoresBatchId: null,
          bulk: true,
        };
      }
      case "service_restored": {
        const restorable = await this.restorable();
        const original = restorable.find((item) => item.batchId === choices.restoresBatchId);
        if (!original) {
          throw AppError.conflict(
            `Service restored answers a service notice from the last ${RESTORE_WINDOW_HOURS} hours, once.`,
          );
        }
        const batch = await this.notices.findBatch(original.batchId);
        return {
          body: serviceRestoredText(original.service),
          variables: { service: original.service },
          areaId: batch?.areaId ?? null,
          restoresBatchId: original.batchId,
          bulk: true,
        };
      }
      case "account_security":
        return {
          body: SMS_ACCOUNT_SECURITY,
          variables: { driverId: choices.driverId },
          areaId: null,
          restoresBatchId: null,
          bulk: false,
        };
    }
  }

  private async recipients(choices: NoticeChoices, built: Built): Promise<{ recipients: NoticeRecipients; targets: { driverId: string; phone: string }[] }> {
    if (choices.category === "account_security") {
      const driver = await this.notices.findDriver(choices.driverId);
      if (!driver) throw AppError.notFound("Driver not found");
      const ok = this.eligible(driver);
      return {
        recipients: {
          count: ok ? 1 : 0,
          excluded: {
            optedOut: driver.smsOptedOut ? 1 : 0,
            noConsent: !driver.smsOptedOut && !driver.smsOptIn ? 1 : 0,
            blocked: !driver.smsOptedOut && driver.smsOptIn && driver.status === "blocked" ? 1 : 0,
          },
          driver: { driverId: driver.driverId, fullName: driver.fullName },
        },
        targets: ok ? [driver] : [],
      };
    }
    const all: NoticeCandidate[] = await this.notices.candidates(built.areaId);
    const targets = all.filter((c) => c.exclusion === null);
    return {
      recipients: {
        count: targets.length,
        excluded: {
          optedOut: all.filter((c) => c.exclusion === "opted_out").length,
          noConsent: all.filter((c) => c.exclusion === "no_consent").length,
          blocked: all.filter((c) => c.exclusion === "blocked").length,
        },
        driver: null,
      },
      targets,
    };
  }

  private eligible(driver: DriverChoice): boolean {
    return driver.smsOptIn && !driver.smsOptedOut && driver.status !== "blocked";
  }

  private nobodyReason(choices: NoticeChoices): string {
    return choices.category === "account_security"
      ? "This driver cannot get texts: they replied STOP, never agreed to texts, or are blocked."
      : "No driver can get this notice.";
  }

  private async limitFor(choices: NoticeChoices): Promise<string | null> {
    if (choices.category === "policy_change") return this.policyLimit();
    if (choices.category === "service_notice") return this.serviceLimit();
    return null;
  }

  private async policyLimit(): Promise<string | null> {
    const since = new Date(this.now().getTime() - POLICY_LIMIT_DAYS * DAY).toISOString();
    const [last] = await this.notices.listSince("policy_change", since);
    if (!last) return null;
    return `A policy change notice went out on ${formatInTimeZone(new Date(last.createdAt), SHIFT_TIME_ZONE, "MMM d")}. One is allowed every ${POLICY_LIMIT_DAYS} days.`;
  }

  private async serviceLimit(): Promise<string | null> {
    const midnight = fromZonedTime(`${this.houstonDate(this.now())}T00:00:00`, SHIFT_TIME_ZONE).toISOString();
    const today = await this.notices.listSince("service_notice", midnight);
    return today.length >= SERVICE_NOTICES_PER_DAY
      ? `${SERVICE_NOTICES_PER_DAY} service notices went out today, the most allowed. Service restored is still open.`
      : null;
  }

  private async restorable(): Promise<RestorableNotice[]> {
    const since = new Date(this.now().getTime() - RESTORE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const recent = await this.notices.listSince("service_notice", since);
    const done = new Set(await this.notices.restoredBatchIds(recent.map((batch) => batch.id)));
    return recent
      .filter((batch) => !done.has(batch.id) && batch.variables.service in NOTICE_SERVICES)
      .map((batch) => {
        const service = batch.variables.service as NoticeServiceKey;
        return { batchId: batch.id, service, label: NOTICE_SERVICES[service].label, sentAt: batch.createdAt };
      });
  }

  private houstonDate(date: Date): string {
    return formatInTimeZone(date, SHIFT_TIME_ZONE, "yyyy-MM-dd");
  }

  private async requireAdmin(adminId: string): Promise<Profile> {
    const profile = await this.profiles.findById(adminId);
    if (!profile || profile.role !== "admin" || profile.status === "blocked") {
      throw AppError.forbidden("Only admins can do this");
    }
    return profile;
  }
}
