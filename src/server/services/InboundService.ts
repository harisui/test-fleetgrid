import { BOOKED_RETRY_DELAYS_MS, RESUME_AFTER_MS, SMS_CONSENT_VERSION } from "@/lib/constants";
import { readInbound, type InboundIntent } from "@/lib/shifts/inbound";
import {
  ALREADY_BOOKED_TEXT,
  bookedText,
  CLOSED_TEXT,
  FILLED_TEXT,
  FORMAT_HELP_TEXT,
  NOT_ELIGIBLE_TEXT,
  OVERLAP_TEXT,
  PAUSED_TEXT,
  type SmsKind,
} from "@/lib/shifts/texts";
import type { IBroadcastRepository } from "@/server/repositories/BroadcastRepository";
import type { IConsentLogRepository } from "@/server/repositories/ConsentLogRepository";
import type { IShiftRepository } from "@/server/repositories/ShiftRepository";
import type { ISmsLogRepository } from "@/server/repositories/SmsLogRepository";
import type { ITextingDriverRepository, TextingDriver } from "@/server/repositories/TextingDriverRepository";
import type { TextService } from "@/server/services/TextService";
import type { ClaimOutcome } from "@/types/domain";

export interface InboundSms {
  /** Twilio's MessageSid: the same reply delivered twice is handled once. */
  sid: string;
  from: string;
  to: string;
  body: string;
  /** Twilio's own reading when Advanced Opt-Out is on: STOP, START or HELP. */
  optOutType?: string | null;
}

export interface InboundResult {
  duplicate: boolean;
  intent: InboundIntent["type"] | null;
  outcome: ClaimOutcome | null;
  /** The kind of reply FleetGrid sent, if any. */
  replied: SmsKind | null;
}

export interface DeliveryUpdate {
  sid: string;
  status: string;
  errorCode: string | null;
}

/**
 * The replies drivers text back (T3.6, T3.8). Every message is logged once by its id.
 * STOP, START and HELP (and YES from a number that opted out) are Twilio's: logged and
 * synced, never answered here, so nobody gets two replies (decision B, 2026-11-01).
 * "YES 4821" books that shift; a bare YES books the one open offer the driver holds. Every
 * YES gets an answer. A reply counts as handled only when all of this has finished.
 */
export class InboundService {
  constructor(
    private readonly drivers: ITextingDriverRepository,
    private readonly shifts: IShiftRepository,
    private readonly recipients: IBroadcastRepository,
    private readonly smsLog: ISmsLogRepository,
    private readonly consentLog: IConsentLogRepository,
    private readonly texts: TextService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async handle(message: InboundSms): Promise<InboundResult> {
    const driver = await this.drivers.findByPhone(message.from);
    await this.smsLog.record({
      direction: "inbound",
      kind: "inbound",
      fromPhone: message.from,
      toPhone: message.to,
      body: message.body,
      providerSid: message.sid,
      status: "received",
      driverId: driver?.driverId ?? null,
    });
    // Finished only when the handling below finished: a retry of an unfinished reply is handled.
    if (!(await this.smsLog.beginInbound(message.sid))) {
      return { duplicate: true, intent: null, outcome: null, replied: null };
    }
    const result = await this.process(message, driver);
    await this.smsLog.finishInbound(message.sid);
    return result;
  }

  /** The job: replies whose handling never finished (the server stopped part way). */
  async reprocessUnfinished(now: Date = this.now()): Promise<number> {
    const unfinished = await this.smsLog.listUnfinishedInbound(new Date(now.getTime() - RESUME_AFTER_MS).toISOString());
    let handled = 0;
    for (const message of unfinished) {
      if (!(await this.handle(message)).duplicate) handled += 1;
    }
    return handled;
  }

  private async process(message: InboundSms, driver: TextingDriver | null): Promise<InboundResult> {
    const intent = readInbound(message.body, driver?.smsOptedOut ?? false, message.optOutType);
    const result: InboundResult = { duplicate: false, intent: intent.type, outcome: null, replied: null };
    if (!driver) {
      await this.smsLog.setContext(message.sid, { inboundOutcome: "unknown_sender" });
      return result;
    }

    switch (intent.type) {
      case "opt_out":
        await this.smsLog.setContext(message.sid, { inboundOutcome: "keyword" });
        await this.syncOptOut(driver, true, intent.keyword);
        return result;
      case "opt_in":
        await this.smsLog.setContext(message.sid, { inboundOutcome: "keyword" });
        await this.syncOptOut(driver, false, intent.keyword);
        return result;
      case "help":
        await this.smsLog.setContext(message.sid, { inboundOutcome: "keyword" });
        return result;
      case "yes":
        return this.book(driver, intent.code, message.sid, result);
      case "other":
        await this.smsLog.setContext(message.sid, { inboundOutcome: "no_code" });
        result.replied = await this.reply(driver, "format_help", FORMAT_HELP_TEXT, null);
        return result;
    }
  }

  /** Twilio's delivery report onto the log and the offer. */
  async handleStatus(update: DeliveryUpdate): Promise<void> {
    await this.smsLog.updateStatus(update.sid, update.status, update.errorCode);
    await this.noteBookedText(update);
    const at = this.now().toISOString();
    if (update.status === "delivered") {
      await this.recipients.updateByMessageSid(update.sid, { status: "delivered", deliveredAt: at });
    } else if (update.status === "failed" || update.status === "undelivered") {
      await this.recipients.updateByMessageSid(update.sid, { status: "failed", errorCode: update.errorCode });
    }
  }

  /** A booked text that did not arrive tells the admin; one that did clears it. */
  private async noteBookedText(update: DeliveryUpdate): Promise<void> {
    const failed = update.status === "failed" || update.status === "undelivered";
    if (!failed && update.status !== "delivered") return;
    const message = await this.smsLog.findBySid(update.sid);
    if (message?.kind !== "booked" || !message.shiftId) return;
    await this.shifts.update(message.shiftId, { bookedNoticeFailedAt: failed ? this.now().toISOString() : null });
  }

  private async book(
    driver: TextingDriver,
    code: string | null,
    sid: string,
    result: InboundResult,
  ): Promise<InboundResult> {
    let shiftCode = code;
    if (!shiftCode) {
      const offers = await this.recipients.openOffersForDriver(driver.driverId);
      if (offers.length !== 1) {
        await this.smsLog.setContext(sid, { inboundOutcome: "no_code" });
        result.replied = await this.reply(driver, "format_help", FORMAT_HELP_TEXT, null);
        return result;
      }
      shiftCode = offers[0].code;
    }

    const claim = await this.shifts.claim(driver.driverId, shiftCode);
    // A real shift this driver was never offered (user decision of 2026-11-05); a mistyped code stays not_found.
    const notOffered = claim.outcome === "not_found" ? await this.shifts.findLiveIdByCode(shiftCode) : null;
    const { outcome, shiftId } = notOffered ? { outcome: "not_eligible" as const, shiftId: notOffered } : claim;
    result.outcome = outcome;
    await this.smsLog.setContext(sid, {
      ...(shiftId ? { shiftId } : {}),
      inboundOutcome: outcome === "won" ? "booked" : outcome === "not_found" ? "no_code" : outcome,
    });

    switch (outcome) {
      case "won": {
        const shift = shiftId ? await this.shifts.findById(shiftId) : null;
        if (shift) {
          const sent = await this.texts.send(driver, "booked", bookedText(shift), shift.id, BOOKED_RETRY_DELAYS_MS);
          if (sent.sent) result.replied = "booked";
          else await this.shifts.update(shift.id, { bookedNoticeFailedAt: this.now().toISOString() });
        }
        break;
      }
      case "filled":
        result.replied = await this.reply(driver, "filled", FILLED_TEXT, shiftId);
        break;
      case "closed":
        result.replied = await this.reply(driver, "closed", CLOSED_TEXT, shiftId);
        break;
      case "not_found":
        result.replied = await this.reply(driver, "format_help", FORMAT_HELP_TEXT, null);
        break;
      case "overlap":
        result.replied = await this.reply(driver, "overlap", OVERLAP_TEXT, shiftId);
        break;
      case "already_yours":
        result.replied = await this.reply(driver, "already_booked", ALREADY_BOOKED_TEXT, shiftId);
        break;
      case "not_eligible":
        result.replied = driver.shiftsPaused
          ? await this.reply(driver, "paused", PAUSED_TEXT, shiftId)
          : await this.reply(driver, "not_eligible", NOT_ELIGIBLE_TEXT, shiftId);
        break;
    }
    return result;
  }

  private async reply(driver: TextingDriver, kind: SmsKind, body: string, shiftId: string | null): Promise<SmsKind | null> {
    const outcome = await this.texts.send(driver, kind, body, shiftId);
    return outcome.sent ? kind : null;
  }

  /** STOP and START: the driver's state, and the proof in the consent log. */
  private async syncOptOut(driver: TextingDriver, optedOut: boolean, keyword: string): Promise<void> {
    if (driver.smsOptedOut === optedOut) return;
    const at = this.now().toISOString();
    await this.drivers.setOptedOut(driver.driverId, optedOut, at);
    await this.consentLog.record({
      phone: driver.phone,
      event: optedOut ? "opt_out" : "opt_in_again",
      consentText: keyword,
      consentVersion: SMS_CONSENT_VERSION,
      source: optedOut ? "sms_stop" : "sms_start",
    });
  }
}
