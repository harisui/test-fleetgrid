// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { docReminderText } from "@/content/sms-samples";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import type { DocReminderCandidate, IDriverNotificationRepository } from "@/server/repositories/DriverNotificationRepository";
import type { INoticeRepository, NewNoticeBatch } from "@/server/repositories/NoticeRepository";
import { DOC_REMINDER_TEMPLATE, DocReminderService } from "@/server/services/DocReminderService";
import { TextService } from "@/server/services/TextService";
import type { NoticeBatch, NoticeCategory } from "@/types/domain";
import { buildProfile, USER_ID } from "../../setup/factories";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeSmsLog, RecordingSmsProvider } from "../../fakes/FakeShiftRepositories";

const ADMIN_ID = "a0000000-0000-4000-8000-0000000000ad";
const DAY = new Date("2026-11-05T17:00:00.000Z"); // 11 AM Houston
const NIGHT = new Date("2026-11-06T04:00:00.000Z"); // 10 PM Houston
const SEVEN = "2026-11-06T13:00:00.000Z";
const id = (n: number) => `d0000000-0000-4000-8000-00000000000${n}`;
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

interface Row {
  driverId: string;
  phone: string;
  missing: string[];
  optIn: boolean;
  optedOut: boolean;
  registered: boolean;
  last: string | null;
}

/** The database's rules of 0030 in memory: candidates with one reason each, and the 3-day claim. */
class FakeDocs implements IDriverNotificationRepository {
  rows: Row[] = [
    { driverId: id(1), phone: "+15555553001", missing: ["cdl_front", "medical_card"], optIn: true, optedOut: false, registered: true, last: null },
    { driverId: id(2), phone: "+15555553002", missing: ["medical_card"], optIn: true, optedOut: false, registered: true, last: null },
    { driverId: id(3), phone: "+15555553003", missing: ["cdl_back"], optIn: true, optedOut: true, registered: true, last: null },
    { driverId: id(4), phone: "+15555553004", missing: ["cdl_back"], optIn: false, optedOut: false, registered: true, last: null },
    { driverId: id(5), phone: "+15555553005", missing: ["cdl_back"], optIn: true, optedOut: false, registered: true, last: "2026-11-04T17:00:00.000Z" },
    { driverId: id(6), phone: "+15555553006", missing: [], optIn: true, optedOut: false, registered: true, last: null },
  ];
  clock = () => DAY;
  private recent(row: Row) {
    return row.last !== null && this.clock().getTime() - new Date(row.last).getTime() < THREE_DAYS;
  }
  async claimReminders() {
    return [];
  }
  async queueApprovalText() {
    return false;
  }
  async claimApprovalTexts() {
    return [];
  }
  async queueWelcomeText() {
    return false;
  }
  async claimWelcomeTexts() {
    return [];
  }
  async docReminderCandidates(driverId?: string): Promise<DocReminderCandidate[]> {
    return this.rows
      .filter((r) => r.registered && r.missing.length > 0 && (!driverId || r.driverId === driverId))
      .map((r) => ({
        driverId: r.driverId,
        phone: r.phone,
        missing: r.missing,
        exclusion: r.optedOut ? "opted_out" : !r.optIn ? "no_consent" : this.recent(r) ? "recent" : null,
        lastDocReminderAt: r.last,
      }));
  }
  async claimDocReminder(driverId: string) {
    const row = this.rows.find((r) => r.driverId === driverId);
    if (!row || !row.registered || !row.optIn || row.optedOut || this.recent(row) || row.missing.length === 0) return null;
    row.last = this.clock().toISOString();
    return { phone: row.phone, missing: row.missing };
  }
}

class FakeBatches implements Pick<INoticeRepository, "insertBatch" | "claimBatch" | "finishBatch" | "listDue" | "findBatch"> {
  batches: NoticeBatch[] = [];
  clock = () => DAY;
  async insertBatch(batch: NewNoticeBatch): Promise<NoticeBatch> {
    const created: NoticeBatch = {
      ...batch,
      excludedRecent: batch.excludedRecent ?? 0,
      id: `b0000000-0000-4000-8000-00000000000${this.batches.length + 1}`,
      status: "queued",
      sentAt: null,
      createdAt: this.clock().toISOString(),
    };
    this.batches.push(created);
    return created;
  }
  async claimBatch(batchId: string) {
    const batch = this.batches.find((b) => b.id === batchId && b.status === "queued");
    if (!batch) return null;
    batch.status = "sending";
    return batch;
  }
  async finishBatch(batchId: string, count: number) {
    const batch = this.batches.find((b) => b.id === batchId)!;
    batch.status = "sent";
    batch.recipientCount = count;
  }
  async listDue(now: string, categories?: NoticeCategory[]) {
    return this.batches.filter(
      (b) => b.status === "queued" && b.sendAfter !== null && b.sendAfter <= now && (!categories || categories.includes(b.category)),
    );
  }
  async findBatch(batchId: string) {
    return this.batches.find((b) => b.id === batchId) ?? null;
  }
}

describe("DocReminderService (CR-5)", () => {
  let docs: FakeDocs;
  let batches: FakeBatches;
  let sms: RecordingSmsProvider;
  let log: FakeSmsLog;
  let audit: AuditEntryInput[];
  let now: Date;
  let service: DocReminderService;

  beforeEach(() => {
    docs = new FakeDocs();
    batches = new FakeBatches();
    sms = new RecordingSmsProvider();
    log = new FakeSmsLog();
    audit = [];
    now = DAY;
    docs.clock = () => now;
    batches.clock = () => now;
    service = new DocReminderService(
      docs,
      batches as unknown as INoticeRepository,
      new FakeProfileRepository([buildProfile({ id: ADMIN_ID, role: "admin", phone: "+15555550102", status: "approved" }), buildProfile({ id: USER_ID })]),
      async (entry) => {
        audit.push(entry);
      },
      new TextService(sms, () => log),
      () => now,
    );
  });

  it("previews the bulk send: who gets it, each wording's count, and who is left out and why", async () => {
    const preview = await service.preview(ADMIN_ID, {});
    expect(preview.body).toBe(DOC_REMINDER_TEMPLATE);
    expect(preview.count).toBe(2);
    expect(preview.excluded).toEqual({ optedOut: 1, noConsent: 1, recent: 1 });
    expect(preview.byItems).toEqual({ "CDL photos": 0, "medical card": 1, "CDL photos and medical card": 1 });
    expect(preview.confirmPhrase).toBe("SEND 2");
    expect(preview.segments).toBe(1);
    expect(preview.blocked).toBeNull();
    expect(preview.sendAfter).toBeNull();
  });

  it("sends each driver the text naming what they miss, logged as doc_reminder, audited", async () => {
    const batch = await service.send(ADMIN_ID, { confirm: "SEND 2" });
    expect(sms.sent).toEqual([
      { to: "+15555553001", body: docReminderText("CDL photos and medical card") },
      { to: "+15555553002", body: docReminderText("medical card") },
    ]);
    expect(log.outbound().map((entry) => entry.kind)).toEqual(["doc_reminder", "doc_reminder"]);
    expect(batch.category).toBe("doc_reminder");
    expect(batch.status).toBe("sent");
    expect(batch.excludedRecent).toBe(1);
    expect(audit).toEqual([expect.objectContaining({ action: "doc_reminder_sent", targetType: "notice_batch", targetId: batch.id })]);
  });

  it("refuses a bulk send whose typed count no longer matches the server's recount", async () => {
    const preview = await service.preview(ADMIN_ID, {});
    docs.rows[1]!.missing = [];
    await expect(service.send(ADMIN_ID, { confirm: preview.confirmPhrase })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(sms.sent).toEqual([]);
    await expect(service.send(ADMIN_ID, { confirm: "SEND 1" })).resolves.toMatchObject({ recipientCount: 1 });
  });

  it("sends at most one per driver per 3 days", async () => {
    await service.send(ADMIN_ID, { driverId: id(2) });
    expect(sms.sent).toHaveLength(1);
    const again = await service.preview(ADMIN_ID, { driverId: id(2) });
    expect(again.blocked).toBe("A documents reminder went to this driver in the last 3 days.");
    await expect(service.send(ADMIN_ID, { driverId: id(2) })).rejects.toMatchObject({ code: "CONFLICT" });
    now = new Date(DAY.getTime() + THREE_DAYS);
    await service.send(ADMIN_ID, { driverId: id(2) });
    expect(sms.sent).toHaveLength(2);
  });

  it("shows one driver's exact text, or why they cannot get one", async () => {
    expect((await service.preview(ADMIN_ID, { driverId: id(1) })).body).toBe(docReminderText("CDL photos and medical card"));
    expect((await service.preview(ADMIN_ID, { driverId: id(3) })).blocked).toBe("This driver replied STOP, so they cannot be texted.");
    expect((await service.preview(ADMIN_ID, { driverId: id(4) })).blocked).toBe("This driver has not agreed to texts.");
    expect((await service.preview(ADMIN_ID, { driverId: id(6) })).blocked).toBe("This driver is not Registered with missing documents.");
  });

  it("checks consent again when the text goes: a STOP after the preview is never texted", async () => {
    now = NIGHT;
    const batch = await service.send(ADMIN_ID, { driverId: id(1) });
    expect(batch.sendAfter).toBe(SEVEN);
    expect(audit[0]).toMatchObject({ action: "doc_reminder_queued", targetType: "driver", targetId: id(1) });
    expect(sms.sent).toEqual([]);
    docs.rows[0]!.optedOut = true;
    now = new Date(SEVEN);
    expect(await service.dispatchDue()).toBe(0);
    expect(sms.sent).toEqual([]);
    expect(batches.batches[0]!.status).toBe("sent");
  });

  it("holds a night send to 7 AM, then the cron sends it", async () => {
    now = NIGHT;
    await service.send(ADMIN_ID, { confirm: "SEND 2" });
    expect(sms.sent).toEqual([]);
    now = new Date(SEVEN);
    expect(await service.dispatchDue()).toBe(2);
    expect(sms.sent).toHaveLength(2);
  });

  it("is for admins only and takes no text body", async () => {
    await expect(service.preview(USER_ID, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.send(ADMIN_ID, { confirm: "SEND 2", body: "FleetGrid: anything" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
