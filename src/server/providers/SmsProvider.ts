import { randomBytes } from "node:crypto";
import type { ServerEnv } from "@/lib/env";
import { TWILIO_STATUS_URL } from "@/server/twilio/signature";

export interface OutboundSms {
  /** E.164. */
  to: string;
  body: string;
}

export interface SentSms {
  /** The provider's message id (Twilio's SM...). */
  sid: string;
  /** The provider's first status: queued, accepted, sent or delivered. */
  status: string;
}

/** Sends shift texts. Twilio in production; the fake everywhere else (T3.2). */
export interface ISmsProvider {
  readonly kind: "twilio" | "fake" | "held";
  /** What the log records as the sender: the Messaging Service id, or "fake". */
  readonly sender: string;
  /** Sends one text. Throws SmsSendError when the provider refuses it. */
  send(message: OutboundSms): Promise<SentSms>;
}

export class SmsSendError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "SmsSendError";
  }
}

/**
 * Twilio's REST API through the Messaging Service, so Twilio picks the approved toll-free
 * sender and applies Advanced Opt-Out. Every text asks for delivery updates at the public
 * status URL.
 */
export class TwilioSmsProvider implements ISmsProvider {
  readonly kind = "twilio" as const;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly messagingServiceSid: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get sender(): string {
    return this.messagingServiceSid;
  }

  async send({ to, body }: OutboundSms): Promise<SentSms> {
    const response = await this.fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          Body: body,
          MessagingServiceSid: this.messagingServiceSid,
          StatusCallback: TWILIO_STATUS_URL,
        }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      code?: number;
      message?: string;
    };
    if (!response.ok || !data.sid) {
      throw new SmsSendError(data.message ?? `Twilio answered ${response.status}`, data.code ? String(data.code) : null);
    }
    return { sid: data.sid, status: data.status ?? "queued" };
  }
}

export interface FakeSentSms extends OutboundSms {
  sid: string;
  at: string;
}

/** Numbers the fake refuses, to show a failed send (a +1 555 number ending 0199). */
export const FAKE_FAILING_NUMBER = "+15555550199";

/**
 * Records texts instead of sending them: local development, the tests and previews. The
 * outbox lives on globalThis so it survives hot reloads; the log in sms_messages is what the
 * app and the browser tests read.
 */
export class FakeSmsProvider implements ISmsProvider {
  readonly kind = "fake" as const;
  readonly sender = "fake";

  static get outbox(): FakeSentSms[] {
    const store = globalThis as { __fleetgridFakeOutbox?: FakeSentSms[] };
    store.__fleetgridFakeOutbox ??= [];
    return store.__fleetgridFakeOutbox;
  }

  async send({ to, body }: OutboundSms): Promise<SentSms> {
    if (to === FAKE_FAILING_NUMBER) throw new SmsSendError("The fake refuses this number", "30003");
    const sid = `SMfake${randomBytes(13).toString("hex")}`;
    FakeSmsProvider.outbox.push({ to, body, sid, at: new Date().toISOString() });
    return { sid, status: "delivered" };
  }
}

/** Twilio when all three keys are set and SMS_TEST_MODE is off; otherwise the fake. */
/**
 * Production without a real sender (no Twilio keys, or test mode left on): nothing goes out and
 * nothing is marked sent. TextService logs each text as held; drainHeld() sends it once Twilio
 * is in place. Never reaches a network.
 */
export class HeldSmsProvider implements ISmsProvider {
  readonly kind = "held" as const;
  readonly sender = "held";

  async send(): Promise<SentSms> {
    throw new SmsSendError("No text sender is set up, so this text is held", null);
  }
}

export function createSmsProvider(env: ServerEnv): ISmsProvider {
  if (
    !env.SMS_TEST_MODE &&
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_MESSAGING_SERVICE_SID
  ) {
    return new TwilioSmsProvider(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_MESSAGING_SERVICE_SID);
  }
  if (env.VERCEL_ENV === "production") return new HeldSmsProvider();
  return new FakeSmsProvider();
}
