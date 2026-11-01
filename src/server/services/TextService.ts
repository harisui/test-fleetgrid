import type { SmsKind } from "@/lib/shifts/texts";
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
}

/**
 * Sends one text and logs it, whatever happens. Never throws for a refused send: the caller
 * records the outcome. Every text the app sends goes through here or BroadcastService.
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
    shiftId: string | null = null,
  ): Promise<TextOutcome> {
    if (to.smsOptedOut) return { sent: false, sid: null, status: "skipped_opted_out", errorCode: null };
    let outcome: TextOutcome;
    try {
      const sent = await this.sms.send({ to: to.phone, body });
      outcome = { sent: true, sid: sent.sid, status: sent.status, errorCode: null };
    } catch (error) {
      const code = error instanceof SmsSendError ? error.code : null;
      this.report(`The ${kind} text was not sent`, error);
      outcome = { sent: false, sid: null, status: "failed", errorCode: code };
    }
    await this.log()
      .record({
        direction: "outbound",
        kind,
        fromPhone: this.sms.sender,
        toPhone: to.phone,
        body,
        providerSid: outcome.sid,
        status: outcome.status,
        errorCode: outcome.errorCode,
        shiftId,
        driverId: to.driverId,
      })
      .catch((error: unknown) => this.report("A sent text was not logged", error));
    return outcome;
  }
}
