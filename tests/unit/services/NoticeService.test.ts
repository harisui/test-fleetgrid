// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import {
  NOTICE_POLICIES,
  NOTICE_SERVICES,
  NOTICE_STATES,
  SMS_ACCOUNT_SECURITY,
  policyChangeText,
  serviceNoticeText,
  serviceRestoredText,
  type NoticePolicy,
  type NoticeService as ServiceKey,
  type NoticeState,
} from "@/content/sms-samples";
import { smsSegments } from "@/lib/sms/segments";
import { noticeChoicesSchema, sendNoticeSchema } from "@/lib/validation/notice.schema";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import type { DriverChoice, INoticeRepository, NewNoticeBatch, NoticeCandidate } from "@/server/repositories/NoticeRepository";
import { NoticeService } from "@/server/services/NoticeService";
import { TextService } from "@/server/services/TextService";
import type { NoticeBatch, NoticeCategory } from "@/types/domain";
import { buildProfile, USER_ID } from "../../setup/factories";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeSmsLog, RecordingSmsProvider } from "../../fakes/FakeShiftRepositories";

const ADMIN_ID = "a0000000-0000-4000-8000-0000000000ad";
const DAY = new Date("2026-11-05T17:00:00.000Z"); // 11 AM Houston, Thursday Nov 5
const NIGHT = new Date("2026-11-06T04:00:00.000Z"); // 10 PM Houston
const SECURITY_DRIVER = "d5000000-0000-4000-8000-000000000001";
const AREA = "a5000000-0000-4000-8000-000000000001";

const candidate = (n: number, exclusion: NoticeCandidate["exclusion"] = null): NoticeCandidate => ({
  driverId: `d0000000-0000-4000-8000-00000000000${n}`,
  phone: `+155555530${String(n).padStart(2, "0")}`,
  exclusion,
});

class FakeNotices implements INoticeRepository {
  people: NoticeCandidate[] = [candidate(1), candidate(2), candidate(3, "opted_out"), candidate(4, "no_consent"), candidate(5, "blocked")];
  inArea: NoticeCandidate[] = [candidate(1)];
  batches: NoticeBatch[] = [];
  driver: DriverChoice = { driverId: SECURITY_DRIVER, fullName: "Sam Secure", phone: "+15555553099", status: "approved", smsOptIn: true, smsOptedOut: false };
  private seq = 0;
  async candidates(areaId: string | null) {
    return areaId ? this.inArea : this.people;
  }
  async insertBatch(batch: NewNoticeBatch): Promise<NoticeBatch> {
    const created: NoticeBatch = { ...batch, id: `b0000000-0000-4000-8000-00000000000${++this.seq}`, status: "queued", sentAt: null, createdAt: this.clock().toISOString() };
    this.batches.push(created);
    return created;
  }
  async claimBatch(id: string) {
    const batch = this.batches.find((b) => b.id === id && b.status === "queued");
    if (!batch) return null;
    batch.status = "sending";
    return batch;
  }
  async finishBatch(id: string, count: number) {
    const batch = this.batches.find((b) => b.id === id)!;
    batch.status = "sent";
    batch.recipientCount = count;
  }
  async listDue(now: string) {
    return this.batches.filter((b) => b.status === "queued" && b.sendAfter !== null && b.sendAfter <= now);
  }
  async listSince(category: NoticeCategory, since: string) {
    return this.batches.filter((b) => b.category === category && b.createdAt >= since);
  }
  async findBatch(id: string) {
    return this.batches.find((b) => b.id === id) ?? null;
  }
  async restoredBatchIds(ids: string[]) {
    return this.batches.map((b) => b.restoresBatchId).filter((id): id is string => id !== null && ids.includes(id));
  }
  async listActiveAreas() {
    return [];
  }
  async searchDrivers() {
    return [this.driver];
  }
  async findDriver(id: string) {
    return id === SECURITY_DRIVER ? this.driver : null;
  }
  clock = () => DAY;
}

describe("the notice templates (CR-3)", () => {
  it("every choice gives approved words, starting FleetGrid: and ending with the STOP line, in one segment", () => {
    const texts = [
      ...(Object.keys(NOTICE_POLICIES) as NoticePolicy[]).map((p) => policyChangeText(p, "Dec 31, 2026")),
      ...(Object.keys(NOTICE_SERVICES) as ServiceKey[]).flatMap((s) => [
        ...(Object.keys(NOTICE_STATES) as NoticeState[]).map((st) => serviceNoticeText(s, st, "12:30 PM")),
        serviceRestoredText(s),
      ]),
    ];
    expect(texts).toHaveLength(12);
    for (const text of texts) {
      expect(text.startsWith("FleetGrid: "), text).toBe(true);
      expect(text.endsWith("Reply STOP to opt out."), text).toBe(true);
      expect(smsSegments(text).segments, text).toBe(1);
    }
    expect(SMS_ACCOUNT_SECURITY.startsWith("FleetGrid: ")).toBe(true);
  });

  it("are word for word, with the verb agreeing with the noun", () => {
    expect(policyChangeText("privacy", "Nov 20, 2026")).toBe(
      "FleetGrid: Our Privacy Policy changes on Nov 20, 2026. Read it at fleetgridus.com/privacy. Reply STOP to opt out.",
    );
    expect(policyChangeText("terms", "Nov 20, 2026")).toBe(
      "FleetGrid: Our Terms of Service change on Nov 20, 2026. Read it at fleetgridus.com/terms. Reply STOP to opt out.",
    );
    expect(serviceNoticeText("website", "unavailable", "3:00 PM")).toBe(
      "FleetGrid: The website is unavailable until about 3:00 PM. We'll text you when it's fixed. Reply STOP to opt out.",
    );
    expect(serviceNoticeText("logins", "delayed", "3:00 PM")).toBe(
      "FleetGrid: Logins are delayed until about 3:00 PM. We'll text you when it's fixed. Reply STOP to opt out.",
    );
    expect(serviceRestoredText("shift_texts")).toBe(
      "FleetGrid: Shift texts are working again. Thanks for your patience. Reply STOP to opt out.",
    );
    expect(SMS_ACCOUNT_SECURITY).toBe(
      "FleetGrid: We noticed unusual activity on your account. Please log in at fleetgridus.com/driver or reply HELP.",
    );
  });

  it("no schema takes a text body or any field it does not know", () => {
    expect(noticeChoicesSchema.safeParse({ category: "account_security", driverId: SECURITY_DRIVER, body: "hi" }).success).toBe(false);
    expect(noticeChoicesSchema.safeParse({ category: "service_notice", service: "logins", state: "delayed", time: "15:00", text: "x" }).success).toBe(false);
    expect(noticeChoicesSchema.safeParse({ category: "other", body: "hi" }).success).toBe(false);
    expect(noticeChoicesSchema.safeParse({ category: "service_notice", service: "free text", state: "delayed", time: "15:00" }).success).toBe(false);
    expect(sendNoticeSchema.safeParse({ choices: { category: "account_security", driverId: SECURITY_DRIVER }, confirm: "SEND 1", body: "x" }).success).toBe(false);
  });

  it("counts segments as carriers bill them", () => {
    expect(smsSegments("a".repeat(160))).toEqual({ characters: 160, segments: 1, encoding: "GSM-7" });
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
    expect(smsSegments("a".repeat(306)).segments).toBe(2);
    expect(smsSegments("{".repeat(81)).characters).toBe(162);
    expect(smsSegments("Shift 🚚").encoding).toBe("UCS-2");
    expect(smsSegments("é".repeat(70)).segments).toBe(1);
    expect(smsSegments("ł".repeat(71)).segments).toBe(2);
  });
});

describe("NoticeService", () => {
  let repo: FakeNotices;
  let sms: RecordingSmsProvider;
  let log: FakeSmsLog;
  let audit: AuditEntryInput[];
  let now: Date;
  let service: NoticeService;
  const policy = { category: "policy_change", policy: "privacy", date: "2026-11-20" } as const;
  const notice = { category: "service_notice", service: "logins", state: "delayed", time: "15:00" } as const;

  beforeEach(() => {
    repo = new FakeNotices();
    sms = new RecordingSmsProvider();
    log = new FakeSmsLog();
    audit = [];
    now = DAY;
    repo.clock = () => now;
    service = new NoticeService(
      repo,
      new FakeProfileRepository([buildProfile({ id: ADMIN_ID, role: "admin", phone: "+15555550102", status: "approved" }), buildProfile({ id: USER_ID })]),
      async (entry) => void audit.push(entry),
      new TextService(sms, () => log),
      () => now,
    );
  });

  it("is for admins only", async () => {
    await expect(service.preview(USER_ID, policy)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.send(USER_ID, { choices: policy, confirm: "SEND 2" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.getOptions(USER_ID)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("previews the exact text, the count, who is left out and why, and the cost", async () => {
    const preview = await service.preview(ADMIN_ID, policy);
    expect(preview).toMatchObject({
      body: "FleetGrid: Our Privacy Policy changes on Nov 20, 2026. Read it at fleetgridus.com/privacy. Reply STOP to opt out.",
      segments: 1,
      recipients: { count: 2, excluded: { optedOut: 1, noConsent: 1, blocked: 1 } },
      sendAfter: null,
      confirmPhrase: "SEND 2",
      blocked: null,
      estimatedCost: 0.02,
    });
    expect((await service.preview(ADMIN_ID, { ...policy, areaId: AREA })).recipients.count).toBe(1);
  });

  it("refuses a policy date in the past or more than 60 days ahead", async () => {
    await expect(service.preview(ADMIN_ID, { ...policy, date: "2026-11-04" })).rejects.toMatchObject({ fieldErrors: { date: expect.any(String) } });
    await expect(service.preview(ADMIN_ID, { ...policy, date: "2027-01-05" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await service.preview(ADMIN_ID, { ...policy, date: "2026-11-05" })).blocked).toBeNull();
  });

  it("sends only after SEND {N} is typed for the current count, to eligible drivers only, audited", async () => {
    await expect(service.send(ADMIN_ID, { choices: policy, confirm: "SEND 5" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(service.send(ADMIN_ID, { choices: policy, confirm: "send 2" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(sms.sent).toEqual([]);
    const batch = await service.send(ADMIN_ID, { choices: policy, confirm: "SEND 2" });
    expect(batch.status).toBe("sent");
    expect(sms.sent.map((m) => m.to)).toEqual([candidate(1).phone, candidate(2).phone]);
    expect(log.outbound().every((e) => e.noticeBatchId === batch.id && e.kind === "notice")).toBe(true);
    expect(audit).toMatchObject([{ action: "notice_sent", targetType: "notice_batch", targetId: batch.id, detail: { category: "policy_change", recipients: 2 } }]);
  });

  it("refuses when the list changed since the admin typed the count", async () => {
    const preview = await service.preview(ADMIN_ID, policy);
    repo.people.push(candidate(6));
    await expect(service.send(ADMIN_ID, { choices: policy, confirm: preview.confirmPhrase })).rejects.toMatchObject({
      message: expect.stringMatching(/list changed/),
    });
  });

  it("allows one policy change every 7 days and three service notices a day", async () => {
    await service.send(ADMIN_ID, { choices: policy, confirm: "SEND 2" });
    expect((await service.preview(ADMIN_ID, policy)).blocked).toMatch(/One is allowed every 7 days/);
    await expect(service.send(ADMIN_ID, { choices: policy, confirm: "SEND 2" })).rejects.toMatchObject({ code: "CONFLICT" });
    now = new Date(DAY.getTime() + 8 * 24 * 3600 * 1000);
    expect((await service.preview(ADMIN_ID, { ...policy, date: "2026-11-20" })).blocked).toBeNull();

    now = DAY;
    for (let i = 0; i < 3; i += 1) await service.send(ADMIN_ID, { choices: notice, confirm: "SEND 2" });
    await expect(service.send(ADMIN_ID, { choices: notice, confirm: "SEND 2" })).rejects.toMatchObject({ message: expect.stringMatching(/3 service notices/) });
  });

  it("offers service restored once per service notice from the last 48 hours, outside the daily limit", async () => {
    const first = await service.send(ADMIN_ID, { choices: notice, confirm: "SEND 2" });
    expect((await service.getOptions(ADMIN_ID)).restorable.map((r) => r.batchId)).toEqual([first.id]);
    const restored = await service.send(ADMIN_ID, { choices: { category: "service_restored", restoresBatchId: first.id }, confirm: "SEND 2" });
    expect(restored.body).toBe("FleetGrid: Logins are working again. Thanks for your patience. Reply STOP to opt out.");
    expect((await service.getOptions(ADMIN_ID)).restorable).toEqual([]);
    await expect(service.send(ADMIN_ID, { choices: { category: "service_restored", restoresBatchId: first.id }, confirm: "SEND 2" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("queues at night: policy changes always, service and security unless sent now", async () => {
    now = NIGHT;
    expect((await service.preview(ADMIN_ID, policy)).sendAfter).toBe("2026-11-06T13:00:00.000Z");
    const queued = await service.send(ADMIN_ID, { choices: policy, confirm: "SEND 2" });
    expect(queued).toMatchObject({ status: "queued", sendAfter: "2026-11-06T13:00:00.000Z" });
    expect(sms.sent).toEqual([]);
    expect(audit.at(-1)?.action).toBe("notice_queued");

    const night = await service.send(ADMIN_ID, { choices: { ...notice, sendNow: true }, confirm: "SEND 2" });
    expect(night.status).toBe("sent");
    expect(sms.sent).toHaveLength(2);
    expect(noticeChoicesSchema.safeParse({ ...policy, sendNow: true }).success).toBe(false);

    // At 7 AM the queued one goes, to whoever is eligible then.
    repo.people[1] = candidate(2, "opted_out");
    now = new Date("2026-11-06T13:00:00.000Z");
    expect(await service.dispatchDue()).toBe(1);
    expect(sms.sent.slice(2).map((m) => m.to)).toEqual([candidate(1).phone]);
    expect(await service.dispatchDue()).toBe(0);
  });

  it("the security notice goes to exactly one driver, and never to one who cannot get texts", async () => {
    const choices = { category: "account_security", driverId: SECURITY_DRIVER } as const;
    const preview = await service.preview(ADMIN_ID, choices);
    expect(preview).toMatchObject({ body: SMS_ACCOUNT_SECURITY, recipients: { count: 1, driver: { fullName: "Sam Secure" } }, confirmPhrase: "SEND 1" });
    await service.send(ADMIN_ID, { choices, confirm: "SEND 1" });
    expect(sms.sent).toEqual([{ to: repo.driver.phone, body: SMS_ACCOUNT_SECURITY }]);
    expect(log.outbound()[0].kind).toBe("security");

    repo.driver = { ...repo.driver, smsOptedOut: true };
    expect((await service.preview(ADMIN_ID, choices)).blocked).toMatch(/cannot get texts/);
    await expect(service.send(ADMIN_ID, { choices, confirm: "SEND 0" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.preview(ADMIN_ID, { ...choices, driverId: "d5000000-0000-4000-8000-000000000009" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(sms.sent).toHaveLength(1);
  });

  it("finds drivers for the security notice and the sheet's link", async () => {
    expect(await service.searchDrivers(ADMIN_ID, { query: "Sam" })).toHaveLength(1);
    expect(await service.findDriverChoice(ADMIN_ID, SECURITY_DRIVER)).toMatchObject({ fullName: "Sam Secure" });
    expect(await service.findDriverChoice(ADMIN_ID, "not-an-id")).toBeNull();
  });
});
