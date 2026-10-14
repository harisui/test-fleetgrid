// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOUR_MS, SlidingWindowLimiter } from "@/lib/rate-limit";
import { AppError } from "@/server/errors/AppError";
import {
  createMailProvider,
  LogMailProvider,
  type IMailProvider,
  type OutgoingMail,
} from "@/server/providers/MailProvider";
import {
  CONTACT_DEV_SECRET,
  CONTACT_RATE_LIMIT_MESSAGE,
  CONTACT_TOO_FAST_MESSAGE,
  ContactService,
  contactSettingsFrom,
  createContactService,
  type ContactOutcome,
} from "@/server/services/ContactService";

vi.mock("server-only", () => ({}));

class FakeMailProvider implements IMailProvider {
  readonly mode = "resend" as const;
  readonly sent: OutgoingMail[] = [];
  failWith: Error | null = null;
  async send(mail: OutgoingMail): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(mail);
  }
}

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const SETTINGS = { from: "FleetGrid <noreply@fleetgridus.com>", to: "support@fleetgridus.com", secret: "s3cret" };
const START = new Date("2026-10-14T12:00:00Z").getTime();

const message = {
  name: "Pat Owner",
  email: "Pat@Example.com",
  role: "carrier",
  company: "Bayou Freight",
  message: "We have a yard in Pasadena and three open shifts next week.\r\nCan you help?",
};

describe("ContactService", () => {
  let mail: FakeMailProvider;
  let outcomes: [ContactOutcome, string | undefined][];
  let clock: number;
  let service: ContactService;

  /** A token issued at the clock, then the clock moved on by `seconds`. */
  function tokenAfter(seconds: number): string {
    const token = service.issueToken();
    clock += seconds * 1000;
    return token;
  }

  beforeEach(() => {
    mail = new FakeMailProvider();
    outcomes = [];
    clock = START;
    service = new ContactService(
      mail,
      SETTINGS,
      { perIp: new SlidingWindowLimiter(5, HOUR_MS), global: new SlidingWindowLimiter(20, HOUR_MS * 24) },
      () => new Date(clock),
      (outcome, detail) => outcomes.push([outcome, detail]),
    );
  });

  it("sends one plain-text mail with the sender as reply-to and the role in the subject", async () => {
    const token = tokenAfter(5);
    const result = await service.submit({ ...message, token }, { ip: "1.1.1.1" });
    expect(result).toEqual({ email: "pat@example.com" });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({
      from: SETTINGS.from,
      to: SETTINGS.to,
      replyTo: "pat@example.com",
      subject: "[Website] Carrier: Pat Owner",
    });
    expect(mail.sent[0].text).toBe(
      [
        "Name: Pat Owner",
        "Email: pat@example.com",
        "I am a: Carrier",
        "Company: Bayou Freight",
        "",
        "We have a yard in Pasadena and three open shifts next week.\nCan you help?",
        "",
        "Sent from the FleetGrid website contact form. Reply to this email to answer.",
      ].join("\n"),
    );
    expect(outcomes).toEqual([["sent", undefined]]);
  });

  it("keeps the name and company on one line, so no header can be forged", async () => {
    const token = tokenAfter(5);
    await service.submit(
      { ...message, name: "Pat\nBcc: x@y.z", company: "Line\r\nTwo", token },
      { ip: "1.1.1.1" },
    );
    expect(mail.sent[0].subject).toBe("[Website] Carrier: Pat Bcc: x@y.z");
    expect(mail.sent[0].text).toContain("Company: Line Two");
  });

  it("logs the outcome only, never the message or the address", async () => {
    const token = tokenAfter(5);
    await service.submit({ ...message, token }, { ip: "1.1.1.1" });
    const logged = JSON.stringify(outcomes);
    expect(logged).not.toMatch(/example\.com|Pasadena|Pat/);
  });

  it("a filled honeypot returns a fake success and sends nothing", async () => {
    const token = tokenAfter(5);
    const result = await service.submit(
      { ...message, company_website: "https://spam.example", token },
      { ip: "1.1.1.1" },
    );
    expect(result).toEqual({ email: "pat@example.com" });
    expect(mail.sent).toEqual([]);
    expect(outcomes).toEqual([["honeypot", undefined]]);
  });

  it("rejects a submission faster than three seconds after the page rendered", async () => {
    const token = tokenAfter(2.9);
    const error = await expectAppError(service.submit({ ...message, token }, { ip: "1.1.1.1" }));
    expect(error.code).toBe("VALIDATION");
    expect(error.message).toBe(CONTACT_TOO_FAST_MESSAGE);
    expect(mail.sent).toEqual([]);
    expect(outcomes).toEqual([["too_fast", undefined]]);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["unsigned", "1760443200000"],
    ["tampered", "1700000000000.0000000000000000000000000000000000000000000000000000000000000000"],
    ["signed by someone else", `${START}.${"a".repeat(64)}`],
  ])("rejects a %s token", async (_label, token) => {
    clock += 10_000;
    const error = await expectAppError(service.submit({ ...message, token }, { ip: "1.1.1.1" }));
    expect(error.code).toBe("VALIDATION");
    expect(mail.sent).toEqual([]);
  });

  it("limits one address to five messages an hour, without touching another address", async () => {
    for (let i = 0; i < 5; i += 1) {
      const token = tokenAfter(5);
      await service.submit({ ...message, token }, { ip: "1.1.1.1" });
    }
    const sixth = tokenAfter(5);
    const error = await expectAppError(service.submit({ ...message, token: sixth }, { ip: "1.1.1.1" }));
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.message).toBe(CONTACT_RATE_LIMIT_MESSAGE);
    expect(mail.sent).toHaveLength(5);
    expect(outcomes.at(-1)).toEqual(["rate_limited", undefined]);

    const other = tokenAfter(5);
    await expect(service.submit({ ...message, token: other }, { ip: "2.2.2.2" })).resolves.toEqual({
      email: "pat@example.com",
    });
  });

  it("limits everyone together to twenty a day", async () => {
    for (let i = 0; i < 20; i += 1) {
      const token = tokenAfter(5);
      await service.submit({ ...message, token }, { ip: `10.0.0.${i}` });
    }
    const token = tokenAfter(5);
    const error = await expectAppError(service.submit({ ...message, token }, { ip: "10.0.1.1" }));
    expect(error.code).toBe("RATE_LIMITED");
  });

  it("validates the fields before anything else", async () => {
    const error = await expectAppError(
      service.submit({ ...message, email: "nope", token: tokenAfter(5) }, { ip: "1.1.1.1" }),
    );
    expect(error.code).toBe("VALIDATION");
    expect(error.fieldErrors).toEqual({ email: "Enter a valid email address" });
    expect(outcomes).toEqual([]);
  });

  it("reports a failed send as an internal error, with the error's name in the log", async () => {
    mail.failWith = new Error("boom");
    const token = tokenAfter(5);
    const error = await expectAppError(service.submit({ ...message, token }, { ip: "1.1.1.1" }));
    expect(error.code).toBe("INTERNAL");
    expect(outcomes).toEqual([["send_failed", "Error"]]);
  });

  describe("without a mail provider (production without RESEND_API_KEY)", () => {
    it("is not ready, issues no token, and shows the error state instead of a fake success", async () => {
      const closed = new ContactService(
        null,
        SETTINGS,
        undefined,
        () => new Date(clock),
        (outcome, detail) => outcomes.push([outcome, detail]),
      );
      expect(closed.ready).toBe(false);
      const token = closed.issueToken();
      clock += 5_000;
      const error = await expectAppError(closed.submit({ ...message, token }, { ip: "1.1.1.1" }));
      expect(error.code).toBe("INTERNAL");
      expect(outcomes.at(-1)).toEqual([
        "mail_unavailable",
        "RESEND_API_KEY or CONTACT_FORM_SECRET is not set",
      ]);
    });
  });
});

describe("contactSettingsFrom and createContactService", () => {
  const base = {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    ENABLE_TEST_LOGIN: false,
    CARRIER_DISABLED: false,
  };

  it("defaults the addresses, and uses the built-in secret outside production only", () => {
    expect(contactSettingsFrom({ NODE_ENV: "development" })).toEqual({
      from: "FleetGrid <noreply@fleetgridus.com>",
      to: "support@fleetgridus.com",
      secret: CONTACT_DEV_SECRET,
    });
    expect(
      contactSettingsFrom({
        NODE_ENV: "production",
        CONTACT_FROM: "FleetGrid <hello@fleetgridus.com>",
        CONTACT_TO: "annie@fleetgridus.com",
        CONTACT_FORM_SECRET: "real",
      }),
    ).toEqual({
      from: "FleetGrid <hello@fleetgridus.com>",
      to: "annie@fleetgridus.com",
      secret: "real",
    });
    expect(contactSettingsFrom({ NODE_ENV: "production" }).secret).toBeNull();
  });

  it("in production without the key there is no provider, so the form fails honestly", async () => {
    expect(createMailProvider({ NODE_ENV: "production" })).toBeNull();
    const service = createContactService({ ...base, NODE_ENV: "production", CONTACT_FORM_SECRET: "x" });
    expect(service.ready).toBe(false);
    const token = service.issueToken();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const error = await expectAppError(
      service.submit({ ...message, token: token.replace(/^\d+/, String(Date.now() - 10_000)) }, { ip: null }),
    );
    // The token no longer verifies after the timestamp swap, and even a valid one would hit the missing provider.
    expect(["VALIDATION", "INTERNAL"]).toContain(error.code);
  });

  it("outside production without the key, the logging stand-in accepts the message", async () => {
    const provider = createMailProvider({ NODE_ENV: "development" });
    expect(provider).toBeInstanceOf(LogMailProvider);
    const service = createContactService({ ...base, NODE_ENV: "development" });
    expect(service.ready).toBe(true);
  });

  it("with the key, Resend is used", () => {
    expect(createMailProvider({ NODE_ENV: "production", RESEND_API_KEY: "re_test" })?.mode).toBe(
      "resend",
    );
  });
});

describe("LogMailProvider", () => {
  it("keeps the mail and logs one line without the body or the address", async () => {
    const lines: string[] = [];
    const provider = new LogMailProvider((line) => lines.push(line));
    await provider.send({
      from: "a",
      to: "b",
      replyTo: "pat@example.com",
      subject: "[Website] Carrier: Pat",
      text: "secret body",
    });
    expect(provider.sent).toHaveLength(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/example\.com|secret body|Pat/);
  });
});
