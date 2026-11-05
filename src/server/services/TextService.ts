import type { SmsKind } from "@/lib/shifts/texts";
import { inBatches, SEND_CONCURRENCY } from "@/server/services/BroadcastService";
import { quietHoursSendAt } from "@/lib/shifts/schedule";
import { SmsSendError, type ISmsProvider } from "@/server/providers/SmsProvider";
import type { ISmsLogRepository } from "@/server/repositories/SmsLogRepository";

export interface TextRecipient {
  driverId: string;
  phone: string;
  /** A number that said STOP is never texted (only Twilio's own replies reach it). */
  smsOptedOut: boolean;
}

export interface TextOutcome {
  sent: boolean;
  sid: string | null;
  status: string;
  errorCode: string | null;
  /** The log row, when one was written. */
  messageId: string | null;
}

export interface TextLinks {
  shiftId?: string | null;
  noticeBatchId?: string | null;
  /** The failed text this one resends. The log allows one resend per text. */
  resendOf?: string | null;
}

/**
 * The one sending path: every text the app sends goes through here. The text is logged
 * first ("sending"), then sent, then the provider's answer is written onto that row, so no
 * text ever goes out unlogged and a resend cannot go twice (the log refuses a second row
 * with the same resend_of before anything is sent). Never throws for a refused send.
 */
export class TextService {
  constructor(
    private readonly sms: ISmsProvider,
    private readonly log: () => ISmsLogRepository,
    private readonly report: (message: string, detail?: unknown) => void = () => undefined,
  ) {}

  get sender(): string {
    return this.sms.sender;
  }

  async send(
    to: TextRecipient,
    kind: SmsKind,
    body: string,
    links: string | null | TextLinks = null,
  ): Promise<TextOutcome> {
    const { shiftId = null, noticeBatchId = null, resendOf = null } =
      typeof links === "string" || links === null ? { shiftId: links } : links;
    if (to.smsOptedOut) {
      return { sent: false, sid: null, status: "skipped_opted_out", errorCode: null, messageId: null };
    }
    const log = this.log();
    const held = this.sms.kind === "held";
    const messageId = await log.record({
      direction: "outbound",
      kind,
      fromPhone: this.sms.sender,
      toPhone: to.phone,
      body,
      providerSid: null,
      status: held ? "held" : "sending",
      shiftId,
      driverId: to.driverId,
      noticeBatchId,
      resendOf,
    });
    if (messageId === null) {
      return { sent: false, sid: null, status: "already_sent", errorCode: null, messageId: null };
    }

    if (held) return { sent: false, sid: null, status: "held", errorCode: null, messageId };

    let outcome: TextOutcome;
    try {
      const sent = await this.sms.send({ to: to.phone, body });
      outcome = { sent: true, sid: sent.sid, status: sent.status, errorCode: null, messageId };
    } catch (error) {
      const code = error instanceof SmsSendError ? error.code : null;
      this.report(`The ${kind} text was not sent`, error);
      outcome = { sent: false, sid: null, status: "failed", errorCode: code, messageId };
    }
    await log
      .updateById(messageId, { providerSid: outcome.sid, status: outcome.status, errorCode: outcome.errorCode })
      .catch((error: unknown) => this.report("A sent text's status was not logged", error));
    return outcome;
  }

  /**
   * Sends the texts held while no real sender was set up, by day only. Consent and STOP are
   * checked again now, and a driver who no longer wants texts never gets one. Returns how many went.
   */
  async drainHeld(
    drivers: { findById(driverId: string): Promise<{ smsOptIn: boolean; smsOptedOut: boolean } | null> },
    now: Date = new Date(),
  ): Promise<number> {
    if (this.sms.kind === "held" || quietHoursSendAt(now)) return 0;
    const log = this.log();
    let sent = 0;
    await inBatches(await log.listHeld(), SEND_CONCURRENCY, async (message) => {
      const driver = message.driverId ? await drivers.findById(message.driverId) : null;
      if (!driver || !driver.smsOptIn || driver.smsOptedOut) {
        await log.updateById(message.id, { providerSid: null, status: "skipped_opted_out", errorCode: null });
        return;
      }
      if (!(await log.claimHeld(message.id, this.sms.sender))) return;
      try {
        const answer = await this.sms.send({ to: message.toPhone, body: message.body });
        await log.updateById(message.id, { providerSid: answer.sid, status: answer.status, errorCode: null });
        sent += 1;
      } catch (error) {
        this.report(`The held ${message.kind} text was not sent`, error);
        const code = error instanceof SmsSendError ? error.code : null;
        await log.updateById(message.id, { providerSid: null, status: "failed", errorCode: code });
      }
    });
    return sent;
  }
}
