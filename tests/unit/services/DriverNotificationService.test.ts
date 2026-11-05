// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SMS_APPROVED, SMS_REMINDER, SMS_WELCOME_NO_NAME, welcomeText } from "@/content/sms-samples";
import { parseServerEnv } from "@/lib/env";
import { phoneHash } from "@/lib/sms/driverTexts";
import { createSmsProvider, FakeSmsProvider, TwilioSmsProvider } from "@/server/providers/SmsProvider";
import type { ClaimedText, ClaimedWelcome, IDriverNotificationRepository } from "@/server/repositories/DriverNotificationRepository";
import { DriverNotificationService } from "@/server/services/DriverNotificationService";
import { TextService } from "@/server/services/TextService";
import { FakeSmsLog, RecordingSmsProvider } from "../../fakes/FakeShiftRepositories";

const DAY = new Date("2026-11-05T17:00:00.000Z"); // 11 AM Houston
const NIGHT = new Date("2026-11-06T04:00:00.000Z"); // 10 PM Houston
const SEVEN = "2026-11-06T13:00:00.000Z"; // 7 AM Houston, the next morning
const A: ClaimedText = { driverId: "d1", phone: "+15555553001" };
const B: ClaimedText = { driverId: "d2", phone: "+15555553002" };

/** The database's once-only rules in memory: a claim stamps, a queue is set once. */
class FakeNotifications implements IDriverNotificationRepository {
  dueReminders: ClaimedText[] = [];
  queued = new Map<string, string>();
  sent = new Set<string>();
  /** Who may get the approval text: consenting and not opted out. */
  consenting = new Set<string>(["d1", "d2"]);
  clock = () => DAY;
  async claimReminders() {
    const due = this.dueReminders;
    this.dueReminders = [];
    return due;
  }
  async queueApprovalText(driverId: string, dueAt: string | null) {
    if (this.queued.has(driverId) || !this.consenting.has(driverId)) return false;
    this.queued.set(driverId, dueAt ?? this.clock().toISOString());
    return true;
  }
  async claimApprovalTexts(driverId?: string) {
    const due = [...this.queued.entries()].filter(
      ([id, at]) => (!driverId || id === driverId) && !this.sent.has(id) && at <= this.clock().toISOString(),
    );
    for (const [id] of due) this.sent.add(id);
    return due.map(([id]) => (id === "d1" ? A : B));
  }
  /** The welcome table: hash to driver and time; a hash is kept forever. */
  welcomes = new Map<string, { driverId: string; dueAt: string; sent: boolean }>();
  names: Record<string, string | null> = { d1: "Maria Lopez", d2: null };
  async queueWelcomeText(hash: string, driverId: string, dueAt: string | null) {
    if (this.welcomes.has(hash)) return false;
    this.welcomes.set(hash, { driverId, dueAt: dueAt ?? this.clock().toISOString(), sent: false });
    return true;
  }
  async claimWelcomeTexts(driverId?: string): Promise<ClaimedWelcome[]> {
    const due = [...this.welcomes.values()].filter(
      (w) => (!driverId || w.driverId === driverId) && !w.sent && w.dueAt <= this.clock().toISOString() && this.consenting.has(w.driverId),
    );
    for (const w of due) w.sent = true;
    return due.map((w) => ({ ...(w.driverId === "d1" ? A : B), fullName: this.names[w.driverId] ?? null }));
  }
  async docReminderCandidates() {
    return [];
  }
  async claimDocReminder() {
    return null;
  }
  async expireRosterGrace() {
    return [];
  }
  async claimCdlStateNotices() {
    return [];
  }
  async claimTwicDateNotices() {
    return [];
  }
}

describe("DriverNotificationService", () => {
  let repo: FakeNotifications;
  let sms: RecordingSmsProvider;
  let log: FakeSmsLog;
  let now: Date;
  let service: DriverNotificationService;

  beforeEach(() => {
    repo = new FakeNotifications();
    sms = new RecordingSmsProvider();
    log = new FakeSmsLog();
    now = DAY;
    repo.clock = () => now;
    service = new DriverNotificationService(repo, new TextService(sms, () => log), () => now);
  });

  it("sends each due reminder once, in the approved words, logged", async () => {
    repo.dueReminders = [A, B];
    expect(await service.sendDueReminders()).toBe(2);
    expect(sms.sent).toEqual([
      { to: A.phone, body: SMS_REMINDER },
      { to: B.phone, body: SMS_REMINDER },
    ]);
    expect(log.outbound().map((entry) => entry.kind)).toEqual(["reminder", "reminder"]);
    expect(await service.sendDueReminders()).toBe(0);
    expect(sms.sent).toHaveLength(2);
  });

  it("sends no reminder outside 10 AM to 7 PM Houston, and does not use any up", async () => {
    repo.dueReminders = [A];
    now = NIGHT;
    expect(await service.sendDueReminders()).toBe(0);
    expect(repo.dueReminders).toEqual([A]);
    expect(sms.sent).toEqual([]);
  });

  it("texts the approval at once by day, once, even after a block and a second approval", async () => {
    await service.onDriverApproved("d1");
    expect(sms.sent).toEqual([{ to: A.phone, body: SMS_APPROVED }]);
    expect(log.outbound().map((entry) => entry.kind)).toEqual(["approved"]);
    await service.onDriverApproved("d1");
    expect(sms.sent).toHaveLength(1);
  });

  it("holds a night approval until 7 AM, then the cron sends it", async () => {
    now = NIGHT;
    await service.onDriverApproved("d1");
    expect(repo.queued.get("d1")).toBe(SEVEN);
    expect(sms.sent).toEqual([]);
    expect(await service.sendDueApprovalTexts()).toBe(0);
    now = new Date(SEVEN);
    expect(await service.sendDueApprovalTexts()).toBe(1);
    expect(sms.sent).toEqual([{ to: A.phone, body: SMS_APPROVED }]);
  });

  it("welcomes a new driver by first name at once by day, once per number ever, logged as welcome", async () => {
    await service.onDriverSignedUp("d1", A.phone);
    expect(sms.sent).toEqual([{ to: A.phone, body: welcomeText("Maria") }]);
    expect(log.outbound().map((entry) => entry.kind)).toEqual(["welcome"]);
    // The same number on a new account (deleted and signed up again) is never welcomed again.
    await service.onDriverSignedUp("d2", A.phone);
    await service.onDriverSignedUp("d1", A.phone);
    expect(sms.sent).toHaveLength(1);
  });

  it("keys the welcome by an HMAC of the number, never the number itself", async () => {
    await service.onDriverSignedUp("d1", A.phone);
    const [key] = [...repo.welcomes.keys()];
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(phoneHash(A.phone));
    expect(key).not.toContain(A.phone.slice(2));
    expect(phoneHash(A.phone, "another-secret")).not.toBe(key);
  });

  it("holds a night welcome until 7 AM, and leaves the name out when there is none", async () => {
    now = NIGHT;
    await service.onDriverSignedUp("d2", B.phone);
    expect(sms.sent).toEqual([]);
    now = new Date(SEVEN);
    expect(await service.sendDueWelcomeTexts()).toBe(1);
    expect(sms.sent).toEqual([{ to: B.phone, body: SMS_WELCOME_NO_NAME }]);
  });

  it("never welcomes a driver without consent", async () => {
    repo.consenting.delete("d2");
    await service.onDriverSignedUp("d2", B.phone);
    expect(sms.sent).toEqual([]);
  });

  it("texts nobody who has not opted in or has replied STOP", async () => {
    repo.consenting.delete("d2");
    await service.onDriverApproved("d2");
    expect(sms.sent).toEqual([]);
  });
});

describe("the text sender without the Twilio keys", () => {
  const base = {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
  };
  const keys = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_MESSAGING_SERVICE_SID: "MG1" };

  it("is the fake, which never calls Twilio, unless all three keys are set and test mode is off", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const missing of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MESSAGING_SERVICE_SID"] as const) {
      const provider = createSmsProvider(parseServerEnv({ ...base, ...keys, [missing]: "" }));
      expect(provider).toBeInstanceOf(FakeSmsProvider);
      await provider.send({ to: "+15555553001", body: SMS_REMINDER });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createSmsProvider(parseServerEnv({ ...base, ...keys, SMS_TEST_MODE: "true" }))).toBeInstanceOf(FakeSmsProvider);
    expect(createSmsProvider(parseServerEnv({ ...base, ...keys }))).toBeInstanceOf(TwilioSmsProvider);
    fetchSpy.mockRestore();
  });
});
