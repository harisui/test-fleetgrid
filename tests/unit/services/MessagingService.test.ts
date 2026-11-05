// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { IMessagingRepository, MessageFilter } from "@/server/repositories/MessagingRepository";
import { MessagingService, resendDecision, RETRYABLE_ERROR_CODES } from "@/server/services/MessagingService";
import { TextService } from "@/server/services/TextService";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import type { BroadcastRecipient, NoticeBatch, Shift, SmsMessage } from "@/types/domain";
import { buildProfile, USER_ID } from "../../setup/factories";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { buildShift, buildTextingDriver, FakeShiftWorld, FakeSmsLog, RecordingSmsProvider } from "../../fakes/FakeShiftRepositories";

const ADMIN_ID = "a0000000-0000-4000-8000-0000000000ad";
const DAY = new Date("2026-11-05T17:00:00.000Z"); // 11 AM Houston
const NIGHT = new Date("2026-11-06T04:00:00.000Z"); // 10 PM Houston
const driver = buildTextingDriver(1);

function text(overrides: Partial<SmsMessage> = {}): SmsMessage {
  return {
    id: "c0ffee00-0000-4000-8000-000000000001",
    direction: "outbound",
    kind: "approved",
    fromPhone: "fake",
    toPhone: driver.phone,
    body: "FleetGrid: Your profile is Roster-Ready. You'll get texts when matching shifts open. Reply STOP to opt out.",
    providerSid: "SM1",
    status: "failed",
    errorCode: "30003",
    shiftId: null,
    driverId: driver.driverId,
    noticeBatchId: null,
    resendOf: null,
    inboundOutcome: null,
    createdAt: "2026-11-05T16:00:00.000Z",
    ...overrides,
  };
}

const decide = (overrides: Partial<Parameters<typeof resendDecision>[0]> = {}) =>
  resendDecision({ message: text(), alreadyResent: false, driver, shiftOpen: null, now: DAY, ...overrides });

describe("resend rules (user decision of 2026-11-01)", () => {
  it("allows the retryable Twilio errors and a send that never reached Twilio", () => {
    for (const code of [...RETRYABLE_ERROR_CODES, null]) {
      expect(decide({ message: text({ errorCode: code }) }), String(code)).toEqual({ allowed: true, reason: null });
    }
  });

  it("never for opted out, filtered, invalid or landline numbers, or an unknown code, with the reason", () => {
    const reasons: Record<string, RegExp> = {
      "21610": /STOP/,
      "30007": /filtered/,
      "30005": /does not exist/,
      "30006": /landline/,
      "21211": /not valid/,
      "21614": /not a mobile/,
      "30004": /blocks texts/,
      "12345": /not one a retry fixes/,
    };
    for (const [code, reason] of Object.entries(reasons)) {
      const result = decide({ message: text({ errorCode: code }) });
      expect(result.allowed, code).toBe(false);
      expect(result.reason, code).toMatch(reason);
    }
  });

  it("only a failed outbound text, never a resend, never twice", () => {
    expect(decide({ message: text({ direction: "inbound" }) }).reason).toMatch(/Only texts FleetGrid sent/);
    expect(decide({ message: text({ status: "delivered", errorCode: null }) }).reason).toMatch(/Only a failed text/);
    expect(decide({ message: text({ resendOf: "m0" }) }).reason).toMatch(/already a resend/);
    expect(decide({ alreadyResent: true }).reason).toMatch(/already resent once/);
  });

  it("re-checks the driver: STOP, no consent, blocked, gone", () => {
    expect(decide({ driver: { ...driver, smsOptedOut: true } }).reason).toMatch(/replied STOP/);
    expect(decide({ driver: { ...driver, smsOptIn: false } }).reason).toMatch(/not agreed/);
    expect(decide({ driver: { ...driver, status: "blocked" } }).reason).toMatch(/blocked/);
    expect(decide({ driver: null }).reason).toMatch(/no longer has an account/);
  });

  it("a shift alert only while its shift is open and the driver is not paused", () => {
    const offer = text({ kind: "offer", shiftId: "s1" });
    expect(decide({ message: offer, shiftOpen: false }).reason).toMatch(/no longer open/);
    expect(decide({ message: offer, shiftOpen: true, driver: { ...driver, shiftsPaused: true } }).reason).toMatch(/paused/);
    expect(decide({ message: offer, shiftOpen: true }).allowed).toBe(true);
  });

  it("not in quiet hours", () => {
    expect(decide({ now: NIGHT }).reason).toMatch(/after 7:00 AM/);
  });
});

/** The admin's reads over a fixed set of texts, shifts and batches. */
class FakeMessaging implements IMessagingRepository {
  messages: SmsMessage[] = [];
  shifts: { shift: Shift; companyName: string }[] = [];
  recipients: BroadcastRecipient[] = [];
  batches: NoticeBatch[] = [];
  constructor(private readonly log?: FakeSmsLog) {}
  private all(): SmsMessage[] {
    const logged = (this.log?.entries ?? []).map((e) =>
      text({ id: e.id, resendOf: e.resendOf ?? null, status: e.status, errorCode: e.errorCode ?? null, providerSid: e.providerSid }),
    );
    return [...this.messages, ...logged];
  }
  async listMessages(f: MessageFilter) {
    return this.all().filter(
      (m) =>
        m.createdAt >= f.from &&
        m.createdAt < f.to &&
        (!f.direction || m.direction === f.direction) &&
        (!f.kinds || f.kinds.includes(m.kind)) &&
        (!f.shiftId || m.shiftId === f.shiftId) &&
        (!f.batchId || m.noticeBatchId === f.batchId),
    );
  }
  async findMessage(id: string) {
    return this.all().find((m) => m.id === id) ?? null;
  }
  async hasResend(id: string) {
    return this.all().some((m) => m.resendOf === id);
  }
  async listBroadcastShifts() {
    return this.shifts;
  }
  async findShift(id: string) {
    return this.shifts.find((s) => s.shift.id === id) ?? null;
  }
  async listRecipients(ids: string[]) {
    return this.recipients.filter((r) => ids.includes(r.shiftId));
  }
  async countBookedNotNotified() {
    return 0;
  }
  async countBookedShifts() {
    return this.shifts.filter((s) => s.shift.status === "booked").length;
  }
  async listBatches() {
    return this.batches;
  }
  async findBatch(id: string) {
    return this.batches.find((b) => b.id === id) ?? null;
  }
  async driverNames(ids: string[]) {
    return new Map(ids.map((id) => [id, `Name of ${id.slice(-4)}`]));
  }
}

function recipient(overrides: Partial<BroadcastRecipient>): BroadcastRecipient {
  return {
    id: "r",
    shiftId: "50000000-0000-4000-8000-000000000001",
    driverId: driver.driverId,
    round: 1,
    position: 1,
    code: "4821",
    status: "delivered",
    messageSid: null,
    errorCode: null,
    sentAt: DAY.toISOString(),
    deliveredAt: DAY.toISOString(),
    repliedAt: null,
    createdAt: DAY.toISOString(),
    ...overrides,
  };
}

describe("MessagingService", () => {
  let repo: FakeMessaging;
  let log: FakeSmsLog;
  let sms: RecordingSmsProvider;
  let world: FakeShiftWorld;
  let audit: AuditEntryInput[];
  let now: Date;
  let service: MessagingService;

  beforeEach(() => {
    log = new FakeSmsLog();
    repo = new FakeMessaging(log);
    sms = new RecordingSmsProvider();
    world = new FakeShiftWorld();
    world.addDriver(driver);
    audit = [];
    now = DAY;
    service = new MessagingService(
      repo,
      new FakeProfileRepository([buildProfile({ id: ADMIN_ID, role: "admin", phone: "+15555550102", status: "approved" }), buildProfile({ id: USER_ID })]),
      async (entry) => void audit.push(entry),
      () => ({ texts: new TextService(sms, () => log), drivers: world.textingDrivers, recipients: world.broadcastRepository }),
      () => now,
    );
  });

  it("is for admins only", async () => {
    await expect(service.getActivity(USER_ID, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.resend(USER_ID, { messageId: text().id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("counts the tiles and groups account texts and broadcasts from the seeded rows", async () => {
    const shift = buildShift({ status: "booked", bookedDriverId: driver.driverId, bookedAt: DAY.toISOString() });
    repo.shifts = [{ shift, companyName: "Bayou Freight" }];
    repo.recipients = [
      recipient({ id: "r1", status: "booked" }),
      recipient({ id: "r2", driverId: "d2", status: "too_late" }),
      recipient({ id: "r3", driverId: "d3", status: "failed", deliveredAt: null }),
    ];
    repo.messages = [
      text({ id: "a1", kind: "approved", status: "delivered", errorCode: null }),
      text({ id: "a2", kind: "approved" }),
      text({ id: "a3", kind: "reminder", status: "delivered", errorCode: null }),
      text({ id: "o1", kind: "offer", shiftId: shift.id, status: "delivered", errorCode: null }),
      text({ id: "i1", direction: "inbound", kind: "inbound", shiftId: shift.id, inboundOutcome: "booked", status: "received", errorCode: null }),
      text({ id: "i2", direction: "inbound", kind: "inbound", shiftId: shift.id, inboundOutcome: "filled", status: "received", errorCode: null }),
      text({ id: "i3", direction: "inbound", kind: "inbound", inboundOutcome: "unknown_sender", status: "received", errorCode: null, driverId: null }),
      text({ id: "n1", kind: "notice", noticeBatchId: "b1000000-0000-4000-8000-000000000001", status: "delivered", errorCode: null }),
    ];
    const page = await service.getActivity(ADMIN_ID, {});
    expect(page.tiles).toEqual({ sent: 5, delivered: 4, failed: 1, replies: 3, shiftsBooked: 1, noticesSent: 1 });
    expect(page.broadcasts[0]).toMatchObject({ sent: 3, delivered: 2, failed: 1, yesReplies: 2, tooLate: 1, bookedBy: expect.any(String) });

    const account = await service.getActivity(ADMIN_ID, { tab: "account", type: "approved" });
    expect(account.accountGroups.map((g) => [g.kind, g.total, g.delivered, g.failed])).toEqual([
      ["approved", 2, 1, 1],
      ["reminder", 1, 1, 0],
      ["welcome", 0, 0, 0],
      ["doc_reminder", 0, 0, 0],
      ["cdl_state_notice", 0, 0, 0],
      ["cancelled", 0, 0, 0],
      ["security", 0, 0, 0],
    ]);
    expect(account.messages.map((r) => r.message.id)).toEqual(["a1", "a2"]);
    expect((await service.getActivity(ADMIN_ID, { tab: "account", type: "approved", status: "failed" })).messages.map((r) => r.message.id)).toEqual(["a2"]);

    const unmatched = await service.getActivity(ADMIN_ID, { tab: "unmatched" });
    expect(unmatched.messages.map((r) => r.message.id)).toEqual(["i3"]);

    const detail = await service.getShiftBroadcast(ADMIN_ID, { shiftId: shift.id });
    expect(detail.recipients.find((r) => r.recipient.id === "r1")?.reply?.id).toBe("i1");
  });

  it("lists notice batches with their counts and opens a batch's texts", async () => {
    repo.batches = [
      {
        id: "b1000000-0000-4000-8000-000000000001",
        category: "service_notice",
        variables: { service: "logins" },
        body: "FleetGrid: x",
        areaId: null,
        createdBy: ADMIN_ID,
        restoresBatchId: null,
        recipientCount: 2,
        excludedOptedOut: 0,
        excludedRecent: 0,
        excludedNoConsent: 0,
        excludedBlocked: 0,
        sendAfter: null,
        status: "sent",
        sentAt: DAY.toISOString(),
        createdAt: DAY.toISOString(),
      },
    ];
    repo.messages = [
      text({ id: "n1", kind: "notice", noticeBatchId: "b1000000-0000-4000-8000-000000000001", status: "delivered", errorCode: null }),
      text({ id: "n2", kind: "notice", noticeBatchId: "b1000000-0000-4000-8000-000000000001" }),
    ];
    const page = await service.getActivity(ADMIN_ID, { tab: "notices", batch: "b1000000-0000-4000-8000-000000000001" });
    expect(page.notices).toMatchObject([{ delivered: 1, failed: 1 }]);
    expect(page.messages.map((r) => r.message.id).sort()).toEqual(["n1", "n2"]);
    const delivered = await service.getActivity(ADMIN_ID, { tab: "notices", batch: "b1000000-0000-4000-8000-000000000001", status: "delivered" });
    expect(delivered.messages.map((r) => r.message.id)).toEqual(["n1"]);
  });

  it("reads the period or the typed Houston dates, and any status from the dropdown", async () => {
    repo.messages = [
      text({ id: "old", createdAt: "2026-10-20T12:00:00.000Z" }),
      text({ id: "today", createdAt: "2026-11-05T15:00:00.000Z" }),
      text({ id: "early", createdAt: "2026-11-05T04:00:00.000Z" }),
    ];
    expect((await service.getActivity(ADMIN_ID, { period: "today" })).tiles.sent).toBe(1);
    expect((await service.getActivity(ADMIN_ID, {})).tiles.sent).toBe(2);
    expect((await service.getActivity(ADMIN_ID, { period: "30d" })).tiles.sent).toBe(3);
    const range = await service.getActivity(ADMIN_ID, { from: "2026-10-20", to: "2026-10-20" });
    expect(range.tiles.sent).toBe(1);
    expect((await service.getActivity(ADMIN_ID, { to: "2026-10-25" })).tiles.sent).toBe(1);
    // 04:00 UTC on Nov 5 is still Nov 4 in Houston (CST, UTC-6).
    expect((await service.getActivity(ADMIN_ID, { from: "2026-11-05" })).tiles.sent).toBe(1);
    expect((await service.getActivity(ADMIN_ID, { status: "any" })).query.status).toBe("");
  });

  it("answers not found for a missing shift, text or resend", async () => {
    const missing = "c0ffee00-0000-4000-8000-000000000099";
    await expect(service.getShiftBroadcast(ADMIN_ID, { shiftId: missing })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.getMessage(ADMIN_ID, { messageId: missing })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.resend(ADMIN_ID, { messageId: missing })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("names the driver of a text and offers no resend for a reply", async () => {
    repo.messages = [text({ id: "c0ffee00-0000-4000-8000-000000000002", direction: "inbound", kind: "inbound", status: "received", errorCode: null })];
    const detail = await service.getMessage(ADMIN_ID, { messageId: "c0ffee00-0000-4000-8000-000000000002" });
    expect(detail.driverName).toEqual(expect.any(String));
    expect(detail.resend.allowed).toBe(false);
    repo.messages = [text({ id: "c0ffee00-0000-4000-8000-000000000003", driverId: null })];
    expect((await service.getMessage(ADMIN_ID, { messageId: "c0ffee00-0000-4000-8000-000000000003" })).driverName).toBeNull();
  });

  it("resends a failed text once through the one sending path, audited, and refuses the second", async () => {
    repo.messages = [text()];
    const resent = await service.resend(ADMIN_ID, { messageId: text().id });
    expect(resent.resendOf).toBe(text().id);
    expect(sms.sent).toEqual([{ to: driver.phone, body: text().body }]);
    expect(audit).toMatchObject([{ action: "message_resent", targetType: "sms_message", targetId: text().id }]);
    await expect(service.resend(ADMIN_ID, { messageId: text().id })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(sms.sent).toHaveLength(1);
    expect((await service.getMessage(ADMIN_ID, { messageId: text().id })).resend.reason).toMatch(/already resent once/);
  });

  it("refuses a blocked resend at send time, whatever the page showed", async () => {
    repo.messages = [text({ errorCode: "21610" })];
    await expect(service.resend(ADMIN_ID, { messageId: text().id })).rejects.toMatchObject({ code: "CONFLICT" });
    repo.messages = [text()];
    now = NIGHT;
    await expect(service.resend(ADMIN_ID, { messageId: text().id })).rejects.toMatchObject({ message: expect.stringMatching(/7:00 AM/) });
    expect(sms.sent).toEqual([]);
  });

  it("a resent shift alert updates that driver's offer", async () => {
    const shift = buildShift({ startsAt: "2026-11-08T12:00:00.000Z", endsAt: "2026-11-08T20:00:00.000Z" });
    world.shifts.set(shift.id, shift);
    repo.shifts = [{ shift, companyName: "Bayou Freight" }];
    const [offer] = await world.broadcastRepository.insertMany([{ shiftId: shift.id, driverId: driver.driverId, round: 1, position: 1, code: "4821" }]);
    await world.broadcastRepository.update(offer.id, { status: "failed", errorCode: "30003" });
    repo.recipients = world.recipients;
    repo.messages = [text({ kind: "offer", shiftId: shift.id })];
    await service.resend(ADMIN_ID, { messageId: text().id });
    expect(world.recipients[0].status).toBe("sent");
  });
});
