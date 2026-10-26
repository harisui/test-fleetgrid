import "server-only";
import { Resend } from "resend";
import type { ServerEnv } from "@/lib/env";

export interface OutgoingMail {
  from: string;
  to: string;
  /** The sender's own address, so a reply from the inbox goes straight back to them. */
  replyTo: string;
  subject: string;
  /** Plain text. Never HTML, so nothing a visitor typed can render as markup. */
  text: string;
}

/** Sends one message. The contact service is the only caller. */
export interface IMailProvider {
  readonly mode: "resend" | "log";
  send(mail: OutgoingMail): Promise<void>;
}

/** Resend, with the client's API key. The domain must be verified there (SPF and DKIM). */
export class ResendProvider implements IMailProvider {
  readonly mode = "resend" as const;

  constructor(private readonly resend: Pick<Resend, "emails">) {}

  async send(mail: OutgoingMail): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: mail.from,
      to: mail.to,
      replyTo: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
    });
    if (error) throw new Error(`Resend refused the message: ${error.name}`);
  }
}

/**
 * Stands in outside production when no RESEND_API_KEY is set: the message is accepted and
 * dropped, with one line in the server log saying so. Never the body, never the address.
 */
export class LogMailProvider implements IMailProvider {
  readonly mode = "log" as const;
  readonly sent: OutgoingMail[] = [];

  constructor(private readonly log: (message: string) => void = (message) => console.info(message)) {}

  async send(mail: OutgoingMail): Promise<void> {
    this.sent.push(mail);
    this.log("[FleetGrid] Contact message accepted but not sent: RESEND_API_KEY is not set");
  }
}

/**
 * Resend when the key is set. Outside production, a logging stand-in so the form works in
 * development and in the browser tests. In production without the key: nothing, and the
 * contact service shows the error state rather than pretending a message went out.
 */
export function createMailProvider(
  env: Pick<ServerEnv, "RESEND_API_KEY" | "NODE_ENV">,
): IMailProvider | null {
  if (env.RESEND_API_KEY) return new ResendProvider(new Resend(env.RESEND_API_KEY));
  if (env.NODE_ENV === "production") return null;
  return new LogMailProvider();
}
