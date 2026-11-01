import { SMS_CONSENT_VERSION } from "@/lib/constants";
import { readInbound, type InboundIntent } from "@/lib/shifts/inbound";
import { bookedText, CLOSED_TEXT, FILLED_TEXT, FORMAT_HELP_TEXT, type SmsKind } from "@/lib/shifts/texts";
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
 * "YES 4821" books that shift; a bare YES books the one open offer the driver holds.
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
    const fresh = await this.smsLog.record({
      direction: "inbound",
      kind: "inbound",
      fromPhone: message.from,
      toPhone: message.to,
      body: message.body,
      providerSid: message.sid,
      status: "received",
      driverId: driver?.driverId ?? null,
    });
    if (!fresh) return { duplicate: true, intent: null, outcome: null, replied: null };

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
    const at = this.now().toISOString();
    if (update.status === "delivered") {
      await this.recipients.updateByMessageSid(update.sid, { status: "delivered", deliveredAt: at });
    } else if (update.status === "failed" || update.status === "undelivered") {
      await this.recipients.updateByMessageSid(update.sid, { status: "failed", errorCode: update.errorCode });
    }
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

    const { outcome, shiftId } = await this.shifts.claim(driver.driverId, shiftCode);
    result.outcome = outcome;
    await this.smsLog.setContext(sid, {
      ...(shiftId ? { shiftId } : {}),
      inboundOutcome: outcome === "won" ? "booked" : outcome === "not_found" ? "no_code" : outcome,
    });

    switch (outcome) {
      case "won": {
        const shift = shiftId ? await this.shifts.findById(shiftId) : null;
        if (shift) result.replied = await this.reply(driver, "booked", bookedText(shift), shift.id);
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
      case "already_yours":
      case "not_eligible":
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
