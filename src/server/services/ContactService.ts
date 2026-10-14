import { createHmac, timingSafeEqual } from "node:crypto";
import type { ServerEnv } from "@/lib/env";
import { DAY_MS, HOUR_MS, SlidingWindowLimiter } from "@/lib/rate-limit";
import { SUPPORT_EMAIL_DEFAULT } from "@/lib/support";
import {
  CONTACT_MESSAGES,
  CONTACT_ROLE_LABELS,
  contactSubmissionSchema,
} from "@/lib/validation/contact.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import { createMailProvider, type IMailProvider } from "@/server/providers/MailProvider";

/** Where the messages go and what they are signed with. */
export interface ContactSettings {
  from: string;
  to: string;
  /** Signs the timestamp in the form. Null means the form cannot run (production without one). */
  secret: string | null;
}

export interface ContactContext {
  ip: string | null;
}

export interface ContactLimits {
  perIp: SlidingWindowLimiter;
  global: SlidingWindowLimiter;
}

/** What the service logs: an outcome and, for failures, a code. Never the message or the address. */
export type ContactOutcome =
  | "sent"
  | "honeypot"
  | "token_invalid"
  | "too_fast"
  | "rate_limited"
  | "mail_unavailable"
  | "send_failed";

export const CONTACT_FROM_DEFAULT = "FleetGrid <noreply@fleetgridus.com>";
export const CONTACT_MIN_SECONDS = 3;
export const CONTACT_PER_IP_PER_HOUR = 5;
export const CONTACT_GLOBAL_PER_DAY = 20;
export const CONTACT_DEV_SECRET = "fleetgrid-dev-contact-secret";

export const CONTACT_TOO_FAST_MESSAGE = "That was quick. Take a moment, then send it again.";
export const CONTACT_RATE_LIMIT_MESSAGE =
  "Too many messages for now. Please try again later, or email support.";

export function defaultContactLimits(): ContactLimits {
  return {
    perIp: new SlidingWindowLimiter(CONTACT_PER_IP_PER_HOUR, HOUR_MS),
    global: new SlidingWindowLimiter(CONTACT_GLOBAL_PER_DAY, DAY_MS),
  };
}

/** Control characters out, line breaks kept, so the plain-text mail reads as typed. */
function clean(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}

/** One line: no line breaks at all, so a header can never be forged from a field. */
function oneLine(value: string): string {
  return clean(value).replace(/\s*\n\s*/g, " ");
}

/**
 * The contact form's server side: the honeypot, the signed time trap, the two rate limits,
 * then one plain-text mail through the provider. Nothing is stored. The log line carries an
 * outcome and a code, never what was written or who wrote it.
 */
export class ContactService {
  constructor(
    private readonly mail: IMailProvider | null,
    private readonly settings: ContactSettings,
    private readonly limits: ContactLimits = defaultContactLimits(),
    private readonly now: () => Date = () => new Date(),
    private readonly log: (outcome: ContactOutcome, detail?: string) => void = (outcome, detail) =>
      console.info(`[FleetGrid] contact form: ${outcome}${detail ? ` (${detail})` : ""}`),
  ) {}

  /** True when a message can actually go out: a sender and a secret both exist. */
  get ready(): boolean {
    return this.mail !== null && this.settings.secret !== null;
  }

  /** A signed timestamp for the hidden field, issued when the page renders. */
  issueToken(): string {
    if (!this.settings.secret) return "";
    const issuedAt = String(this.now().getTime());
    return `${issuedAt}.${this.sign(issuedAt)}`;
  }

  /** The time the token was issued, or null when it was not ours. */
  private verifyToken(token: string): number | null {
    if (!this.settings.secret) return null;
    const [issuedAt, signature] = token.split(".");
    if (!issuedAt || !signature || !/^\d+$/.test(issuedAt)) return null;
    const expected = this.sign(issuedAt);
    if (expected.length !== signature.length) return null;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
    return Number(issuedAt);
  }

  private sign(value: string): string {
    return createHmac("sha256", this.settings.secret ?? "").update(value).digest("hex");
  }

  async submit(input: unknown, context: ContactContext): Promise<{ email: string }> {
    const data = parseInput(contactSubmissionSchema, input);

    // A filled honeypot is a bot: say thanks, send nothing.
    if (data.company_website.trim() !== "") {
      this.log("honeypot");
      return { email: data.email };
    }

    const issuedAt = this.verifyToken(data.token);
    if (issuedAt === null) {
      this.log("token_invalid");
      throw AppError.validation(CONTACT_MESSAGES.token, { token: CONTACT_MESSAGES.token });
    }
    const now = this.now().getTime();
    if (now - issuedAt < CONTACT_MIN_SECONDS * 1000) {
      this.log("too_fast");
      throw AppError.validation(CONTACT_TOO_FAST_MESSAGE);
    }

    if (!this.limits.perIp.take(context.ip ?? "unknown", now) || !this.limits.global.take("all", now)) {
      this.log("rate_limited");
      throw AppError.rateLimited(CONTACT_RATE_LIMIT_MESSAGE);
    }

    if (!this.mail || !this.settings.secret) {
      // Production without RESEND_API_KEY or CONTACT_FORM_SECRET: the form shows its error
      // state with the support address. Never a fake success, or real messages vanish.
      this.log("mail_unavailable", "RESEND_API_KEY or CONTACT_FORM_SECRET is not set");
      throw AppError.internal(new Error("Contact form mail provider is not configured"));
    }

    const role = CONTACT_ROLE_LABELS[data.role];
    const lines = [
      `Name: ${oneLine(data.name)}`,
      `Email: ${oneLine(data.email)}`,
      `I am a: ${role}`,
      ...(data.company ? [`Company: ${oneLine(data.company)}`] : []),
      "",
      clean(data.message),
      "",
      "Sent from the FleetGrid website contact form. Reply to this email to answer.",
    ];

    try {
      await this.mail.send({
        from: this.settings.from,
        to: this.settings.to,
        replyTo: data.email,
        subject: `[Website] ${role}: ${oneLine(data.name)}`,
        text: lines.join("\n"),
      });
    } catch (error) {
      this.log("send_failed", error instanceof Error ? error.name : "unknown");
      throw AppError.internal(error);
    }
    this.log("sent");
    return { email: data.email };
  }
}

/** The settings from the environment. Outside production a dev secret stands in. */
export function contactSettingsFrom(
  env: Pick<ServerEnv, "CONTACT_FROM" | "CONTACT_TO" | "CONTACT_FORM_SECRET" | "NODE_ENV">,
): ContactSettings {
  return {
    from: env.CONTACT_FROM ?? CONTACT_FROM_DEFAULT,
    to: env.CONTACT_TO ?? SUPPORT_EMAIL_DEFAULT,
    secret:
      env.CONTACT_FORM_SECRET ?? (env.NODE_ENV === "production" ? null : CONTACT_DEV_SECRET),
  };
}

export function createContactService(env: ServerEnv): ContactService {
  return new ContactService(createMailProvider(env), contactSettingsFrom(env));
}
