import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { RETRYABLE_ERROR_CODES } from "@/lib/sms/retryable";
import { displayStatus, isBookable, quietHoursSendAt } from "@/lib/shifts/schedule";
import { SHIFT_TIME_ZONE, type SmsKind } from "@/lib/shifts/texts";
import {
  ACCOUNT_KINDS,
  messageIdSchema,
  messagingQuerySchema,
  type AccountKind,
  type MessagingQuery,
} from "@/lib/validation/messaging.schema";
import { shiftIdSchema } from "@/lib/validation/shift.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import type { IBroadcastRepository } from "@/server/repositories/BroadcastRepository";
import type { IMessagingRepository } from "@/server/repositories/MessagingRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { ITextingDriverRepository, TextingDriver } from "@/server/repositories/TextingDriverRepository";
import type { TextService } from "@/server/services/TextService";
import type { BroadcastRecipient, NoticeBatch, Profile, Shift, SmsMessage } from "@/types/domain";
import { ROSTER_READY } from "@/lib/drivers/tiers";

export { RETRYABLE_ERROR_CODES };

const NEVER_RETRY: Record<string, string> = {
  "21610": "The number replied STOP (Twilio 21610).",
  "30007": "The carrier filtered the text (Twilio 30007).",
  "30005": "The number does not exist (Twilio 30005).",
  "30006": "The number is a landline (Twilio 30006).",
  "21211": "The number is not valid (Twilio 21211).",
  "21614": "The number is not a mobile number (Twilio 21614).",
  "30004": "The number blocks texts (Twilio 30004).",
};

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  approved: `${ROSTER_READY} text`,
  reminder: "Profile reminder",
  welcome: "Welcome",
  doc_reminder: "Documents reminder",
  cdl_state_notice: "CDL state",
  cancelled: "Cancellation",
  security: "Security",
};

const FAILED = new Set(["failed", "undelivered"]);
const DELIVERED_RECIPIENT = new Set(["delivered", "booked", "too_late", "no_show"]);
const YES_OUTCOMES = new Set(["booked", "already_yours", "filled", "closed", "not_eligible"]);
const UNMATCHED = ["unknown_sender", "no_code"];

export type MessageState = "sent" | "delivered" | "failed" | "held";

export function messageState(message: Pick<SmsMessage, "status">): MessageState {
  if (message.status && FAILED.has(message.status)) return "failed";
  if (message.status === "delivered") return "delivered";
  if (message.status === "held") return "held";
  return "sent";
}

export interface ResendDecision {
  allowed: boolean;
  reason: string | null;
}

/** Whether a failed text may be sent again, and why not. Checked again at send time. */
export function resendDecision(input: {
  message: SmsMessage;
  alreadyResent: boolean;
  driver: Pick<TextingDriver, "status" | "smsOptIn" | "smsOptedOut" | "shiftsPaused"> | null;
  /** For a shift alert: whether its shift can still be booked. */
  shiftOpen: boolean | null;
  now: Date;
}): ResendDecision {
  const { message, driver } = input;
  const no = (reason: string): ResendDecision => ({ allowed: false, reason });
  if (message.direction !== "outbound") return no("Only texts FleetGrid sent can be resent.");
  if (messageState(message) !== "failed") return no("Only a failed text can be resent.");
  if (message.resendOf) return no("This text is already a resend. Each text is resent once.");
  if (input.alreadyResent) return no("This text was already resent once.");
  if (message.errorCode && !(RETRYABLE_ERROR_CODES as readonly string[]).includes(message.errorCode)) {
    return no(NEVER_RETRY[message.errorCode] ?? `Twilio error ${message.errorCode} is not one a retry fixes.`);
  }
  if (!driver) return no("The driver no longer has an account.");
  if (driver.smsOptedOut) return no("The driver replied STOP.");
  if (!driver.smsOptIn) return no("The driver has not agreed to texts.");
  if (driver.status === "blocked") return no("The driver is blocked.");
  if (message.kind === "offer") {
    if (!input.shiftOpen) return no("The shift is no longer open.");
    if (driver.shiftsPaused) return no("The driver's shift texts are paused.");
  }
  if (quietHoursSendAt(input.now)) return no("Quiet hours: try again after 7:00 AM Houston time.");
  return { allowed: true, reason: null };
}

export interface ActivityTiles {
  sent: number;
  delivered: number;
  failed: number;
  replies: number;
  shiftsBooked: number;
  noticesSent: number;
}

export interface BroadcastRow {
  shift: Shift;
  status: Shift["status"];
  companyName: string;
  sent: number;
  delivered: number;
  failed: number;
  yesReplies: number;
  bookedBy: string | null;
  tooLate: number;
}

export interface MessageRow {
  message: SmsMessage;
  driverName: string | null;
  state: MessageState;
}

export interface AccountGroup {
  kind: AccountKind;
  label: string;
  total: number;
  delivered: number;
  failed: number;
}

export interface NoticeRow {
  batch: NoticeBatch;
  delivered: number;
  failed: number;
}

export interface ActivityPage {
  query: MessagingQuery;
  /** Booked shifts whose driver never got the booked text: call them. */
  bookedNotNotified: number;
  range: { from: string; to: string };
  tiles: ActivityTiles;
  broadcasts: BroadcastRow[];
  accountGroups: AccountGroup[];
  notices: NoticeRow[];
  /** The messages of the open list: an account group, a notice batch or the unmatched replies. */
  messages: MessageRow[];
}

export interface RecipientDetail {
  recipient: BroadcastRecipient;
  driverName: string | null;
  reply: SmsMessage | null;
}

export interface ShiftBroadcastDetail extends BroadcastRow {
  recipients: RecipientDetail[];
}

export interface MessageDetail {
  message: SmsMessage;
  driverName: string | null;
  resend: ResendDecision;
}

export interface MessagingTexting {
  texts: TextService;
  drivers: ITextingDriverRepository;
  recipients: IBroadcastRepository;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * The admin's Activity page (Milestone 3 part 6): what went out, what came back, and the
 * resend of a failed text, which goes through the one sending path and the log's
 * one-resend rule.
 */
export class MessagingService {
  constructor(
    private readonly messaging: IMessagingRepository,
    private readonly profiles: IProfileRepository,
    private readonly writeAudit: (entry: AuditEntryInput) => Promise<unknown>,
    private readonly texting: () => MessagingTexting,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getActivity(adminId: string, input: unknown): Promise<ActivityPage> {
    await this.requireAdmin(adminId);
    const query = parseInput(messagingQuerySchema, input);
    const range = this.rangeOf(query);
    const all = await this.messaging.listMessages({ ...range, driverId: query.driver, shiftId: query.shift });
    const outbound = all.filter((m) => m.direction === "outbound");
    const tiles: ActivityTiles = {
      sent: outbound.length,
      delivered: outbound.filter((m) => messageState(m) === "delivered").length,
      failed: outbound.filter((m) => messageState(m) === "failed").length,
      replies: all.filter((m) => m.direction === "inbound").length,
      shiftsBooked: await this.messaging.countBookedShifts(range.from, range.to),
      noticesSent: outbound.filter((m) => m.noticeBatchId !== null && messageState(m) !== "failed").length,
    };

    const page: ActivityPage = { query, range, tiles, bookedNotNotified: await this.messaging.countBookedNotNotified(), broadcasts: [], accountGroups: [], notices: [], messages: [] };
    const byStatus = (m: SmsMessage) => !query.status || messageState(m) === query.status;

    if (query.tab === "broadcasts") {
      page.broadcasts = await this.broadcastRows(range, query.shift);
    } else if (query.tab === "account") {
      page.accountGroups = ACCOUNT_KINDS.map((kind) => {
        const of = outbound.filter((m) => m.kind === kind);
        return {
          kind,
          label: ACCOUNT_KIND_LABELS[kind],
          total: of.length,
          delivered: of.filter((m) => messageState(m) === "delivered").length,
          failed: of.filter((m) => messageState(m) === "failed").length,
        };
      });
      if (query.type) page.messages = await this.rows(outbound.filter((m) => m.kind === query.type && byStatus(m)));
    } else if (query.tab === "notices") {
      const batches = await this.messaging.listBatches(range.from, range.to);
      const texts = await this.messaging.listMessages({ from: range.from, to: new Date(this.now().getTime() + DAY).toISOString(), kinds: ["notice", "security"] });
      page.notices = batches.map((batch) => {
        const of = texts.filter((m) => m.noticeBatchId === batch.id);
        return {
          batch,
          delivered: of.filter((m) => messageState(m) === "delivered").length,
          failed: of.filter((m) => messageState(m) === "failed").length,
        };
      });
      if (query.batch) page.messages = await this.rows(texts.filter((m) => m.noticeBatchId === query.batch && byStatus(m)));
    } else {
      page.messages = await this.rows(
        all.filter((m) => m.direction === "inbound" && m.inboundOutcome !== null && UNMATCHED.includes(m.inboundOutcome)),
      );
    }
    return page;
  }

  /** One shift's broadcast: every recipient with their status, times and reply. */
  async getShiftBroadcast(adminId: string, input: unknown): Promise<ShiftBroadcastDetail> {
    await this.requireAdmin(adminId);
    const { shiftId } = parseInput(shiftIdSchema, input);
    const found = await this.messaging.findShift(shiftId);
    if (!found) throw AppError.notFound("Shift not found");
    const [recipients, texts] = await Promise.all([
      this.messaging.listRecipients([shiftId]),
      this.messaging.listMessages({ from: "1970-01-01T00:00:00Z", to: "2999-01-01T00:00:00Z", shiftId }),
    ]);
    const names = await this.messaging.driverNames(recipients.map((r) => r.driverId));
    const replies = texts.filter((m) => m.direction === "inbound");
    return {
      ...this.broadcastRow(found, recipients, replies, names),
      recipients: recipients.map((recipient) => ({
        recipient,
        driverName: names.get(recipient.driverId) ?? null,
        reply: replies.find((m) => m.driverId === recipient.driverId) ?? null,
      })),
    };
  }

  async getMessage(adminId: string, input: unknown): Promise<MessageDetail> {
    await this.requireAdmin(adminId);
    const { messageId } = parseInput(messageIdSchema, input);
    const message = await this.messaging.findMessage(messageId);
    if (!message) throw AppError.notFound("Text not found");
    const names = await this.messaging.driverNames(message.driverId ? [message.driverId] : []);
    return {
      message,
      driverName: message.driverId ? (names.get(message.driverId) ?? null) : null,
      resend: await this.decide(message),
    };
  }

  /**
   * Sends a failed text again, once: everything is checked again now, the text goes through
   * the one sending path with resend_of set (the log refuses a second), a resent shift
   * alert updates that driver's offer, and the audit log records it.
   */
  async resend(adminId: string, input: unknown): Promise<SmsMessage> {
    const admin = await this.requireAdmin(adminId);
    const { messageId } = parseInput(messageIdSchema, input);
    const message = await this.messaging.findMessage(messageId);
    if (!message) throw AppError.notFound("Text not found");
    const decision = await this.decide(message);
    if (!decision.allowed) throw AppError.conflict(decision.reason ?? "This text cannot be resent");

    const { texts, drivers, recipients } = this.texting();
    const driver = await drivers.findById(message.driverId as string);
    if (!driver) throw AppError.conflict("The driver no longer has an account.");
    const outcome = await texts.send(driver, message.kind as SmsKind, message.body, {
      shiftId: message.shiftId,
      noticeBatchId: message.noticeBatchId,
      resendOf: message.id,
    });
    if (outcome.status === "already_sent") throw AppError.conflict("This text was already resent once.");

    if (message.kind === "offer" && message.shiftId) {
      const offer = (await this.messaging.listRecipients([message.shiftId])).find(
        (r) => r.driverId === driver.driverId && r.status === "failed",
      );
      if (offer) {
        await recipients.update(offer.id, {
          status: outcome.sent ? (outcome.status === "delivered" ? "delivered" : "sent") : "failed",
          messageSid: outcome.sid,
          errorCode: outcome.errorCode,
          sentAt: outcome.sent ? this.now().toISOString() : null,
        });
      }
    }
    await this.writeAudit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: "message_resent",
      targetType: "sms_message",
      targetId: message.id,
      detail: { kind: message.kind, sent: outcome.sent, status: outcome.status },
    });
    const resent = outcome.messageId ? await this.messaging.findMessage(outcome.messageId) : null;
    if (!resent) throw AppError.internal(new Error("The resent text was not logged"));
    return resent;
  }

  private async decide(message: SmsMessage): Promise<ResendDecision> {
    const { drivers } = this.texting();
    const [alreadyResent, driver, shift] = await Promise.all([
      this.messaging.hasResend(message.id),
      message.driverId ? drivers.findById(message.driverId) : Promise.resolve(null),
      message.kind === "offer" && message.shiftId ? this.messaging.findShift(message.shiftId) : Promise.resolve(null),
    ]);
    const now = this.now();
    const shiftOpen = shift ? shift.shift.status === "open" && isBookable(shift.shift, now) : null;
    return resendDecision({ message, alreadyResent, driver, shiftOpen, now });
  }

  private async broadcastRows(range: { from: string; to: string }, shiftId?: string): Promise<BroadcastRow[]> {
    const shifts = (await this.messaging.listBroadcastShifts(range.from, range.to)).filter(
      (row) => !shiftId || row.shift.id === shiftId,
    );
    const ids = shifts.map((row) => row.shift.id);
    const [recipients, replies] = await Promise.all([
      this.messaging.listRecipients(ids),
      this.messaging.listMessages({ from: range.from, to: "2999-01-01T00:00:00Z", direction: "inbound" }),
    ]);
    const booked = shifts.map((row) => row.shift.bookedDriverId).filter((id): id is string => id !== null);
    const names = await this.messaging.driverNames(booked);
    return shifts.map((row) =>
      this.broadcastRow(
        row,
        recipients.filter((r) => r.shiftId === row.shift.id),
        replies.filter((m) => m.shiftId === row.shift.id),
        names,
      ),
    );
  }

  private broadcastRow(
    row: { shift: Shift; companyName: string },
    recipients: BroadcastRecipient[],
    replies: SmsMessage[],
    names: Map<string, string>,
  ): BroadcastRow {
    return {
      shift: row.shift,
      status: displayStatus(row.shift, this.now()),
      companyName: row.companyName,
      sent: recipients.filter((r) => r.status !== "queued").length,
      delivered: recipients.filter((r) => DELIVERED_RECIPIENT.has(r.status)).length,
      failed: recipients.filter((r) => r.status === "failed").length,
      yesReplies: replies.filter((m) => m.inboundOutcome !== null && YES_OUTCOMES.has(m.inboundOutcome)).length,
      bookedBy: row.shift.bookedDriverId ? (names.get(row.shift.bookedDriverId) ?? null) : null,
      tooLate: recipients.filter((r) => r.status === "too_late").length,
    };
  }

  private async rows(messages: SmsMessage[]): Promise<MessageRow[]> {
    const names = await this.messaging.driverNames(messages.map((m) => m.driverId).filter((id): id is string => id !== null));
    return messages.map((message) => ({
      message,
      driverName: message.driverId ? (names.get(message.driverId) ?? null) : null,
      state: messageState(message),
    }));
  }

  /** The dates typed (Houston days, both ends included), else the period up to now. */
  private rangeOf(query: MessagingQuery): { from: string; to: string } {
    const now = this.now();
    if (query.from || query.to) {
      const from = query.from ? fromZonedTime(`${query.from}T00:00:00`, SHIFT_TIME_ZONE) : new Date(0);
      const to = query.to
        ? new Date(fromZonedTime(`${query.to}T00:00:00`, SHIFT_TIME_ZONE).getTime() + DAY)
        : new Date(now.getTime() + DAY);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    const today = fromZonedTime(`${formatInTimeZone(now, SHIFT_TIME_ZONE, "yyyy-MM-dd")}T00:00:00`, SHIFT_TIME_ZONE);
    const from = query.period === "today" ? today : new Date(now.getTime() - (query.period === "30d" ? 30 : 7) * DAY);
    return { from: from.toISOString(), to: new Date(now.getTime() + 60_000).toISOString() };
  }

  private async requireAdmin(adminId: string): Promise<Profile> {
    const profile = await this.profiles.findById(adminId);
    if (!profile || profile.role !== "admin" || profile.status === "blocked") {
      throw AppError.forbidden("Only admins can do this");
    }
    return profile;
  }
}
