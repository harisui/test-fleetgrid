import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { docReminderText, SMS_APPROVED, welcomeText } from "@/content/sms-samples";
import { phoneHash } from "@/lib/sms/driverTexts";
import { DriverNotificationRepository } from "@/server/repositories/DriverNotificationRepository";
import { NoticeRepository } from "@/server/repositories/NoticeRepository";
import { ProfileRepository } from "@/server/repositories/ProfileRepository";
import { SmsLogRepository } from "@/server/repositories/SmsLogRepository";
import { DocReminderService } from "@/server/services/DocReminderService";
import { DriverNotificationService } from "@/server/services/DriverNotificationService";
import { TextService } from "@/server/services/TextService";
import { RecordingSmsProvider } from "../../fakes/FakeShiftRepositories";
import { cleanupTestUsers, createListedDriver, createTestUser, serviceClient, type TestDriver } from "../../setup/supabase";

const DAY = () => new Date(Date.UTC(2026, 10, 5, 17)); // 11 AM Houston

/**
 * The approval text through the real database (0025): queued once, claimed once, logged in
 * sms_messages, and never for a driver who opted out. The reminder's 24-hour rule is in
 * pgTAP (015), which can set an old updated_at.
 */
describe("the one-time approval text", () => {
  let consenting: TestDriver;
  let optedOut: TestDriver;
  let sms: RecordingSmsProvider;
  let service: DriverNotificationService;

  beforeAll(async () => {
    consenting = await createListedDriver({ fullName: "Approved Texted" });
    optedOut = await createListedDriver({ fullName: "Approved Stopped", sms_opted_out: true, sms_opted_out_at: new Date().toISOString() });
    sms = new RecordingSmsProvider();
    const admin = serviceClient();
    service = new DriverNotificationService(
      new DriverNotificationRepository(admin),
      new TextService(sms, () => new SmsLogRepository(admin)),
      DAY,
    );
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  it("goes once to a consenting driver, logged, and never again after a second approval", async () => {
    await service.onDriverApproved(consenting.driverId);
    await service.onDriverApproved(consenting.driverId);
    expect(sms.sent.filter((m) => m.to === consenting.phone)).toEqual([{ to: consenting.phone, body: SMS_APPROVED }]);
    const { data: row } = await serviceClient()
      .from("drivers")
      .select("approval_text_due_at, approval_text_sent_at")
      .eq("id", consenting.driverId)
      .single();
    expect(row?.approval_text_sent_at).not.toBeNull();
    const { data: log } = await serviceClient().from("sms_messages").select("kind, body").eq("driver_id", consenting.driverId);
    expect(log).toEqual([{ kind: "approved", body: SMS_APPROVED }]);
  });

  it("never goes to a driver who replied STOP", async () => {
    await service.onDriverApproved(optedOut.driverId);
    expect(sms.sent.filter((m) => m.to === optedOut.phone)).toEqual([]);
    const { data: row } = await serviceClient().from("drivers").select("approval_text_due_at").eq("id", optedOut.driverId).single();
    expect(row?.approval_text_due_at).toBeNull();
  });

  it("a signed-in driver cannot clear the stamp to get it again", async () => {
    const { error } = await consenting.client
      .from("drivers")
      .update({ approval_text_sent_at: null })
      .eq("id", consenting.driverId);
    expect(error?.code).toBe("42501");
  });
});

/**
 * The welcome and the missing-documents reminder through the real database (0030). Each run
 * keys the welcome with its own secret: the table outlives accounts by design, so a fixed key
 * would remember the test numbers from the last run.
 */
describe("the welcome and documents reminder texts (CR-5)", () => {
  let registered: TestDriver;
  let noConsent: TestDriver;
  let sms: RecordingSmsProvider;
  let service: DriverNotificationService;
  let reminders: DocReminderService;
  let adminId: string;
  const secret = `integration-${crypto.randomUUID()}`;

  beforeAll(async () => {
    registered = await createListedDriver({ fullName: "Welcome Driver", status: "pending" });
    noConsent = await createListedDriver({ fullName: "Quiet Driver", status: "pending", sms_opt_in: false, sms_opt_in_at: null, sms_opt_in_text: null });
    sms = new RecordingSmsProvider();
    const admin = serviceClient();
    const texts = new TextService(sms, () => new SmsLogRepository(admin));
    service = new DriverNotificationService(new DriverNotificationRepository(admin), texts, DAY, secret);
    const adminUser = await createTestUser({ role: "admin", status: "approved" });
    reminders = new DocReminderService(
      new DriverNotificationRepository(admin),
      new NoticeRepository(admin),
      new ProfileRepository(admin),
      async () => undefined,
      texts,
      DAY,
    );
    adminId = adminUser.id;
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  it("welcomes a consenting driver once by first name, keyed by a hash of the number", async () => {
    await service.onDriverSignedUp(registered.driverId, registered.phone);
    await service.onDriverSignedUp(registered.driverId, registered.phone);
    expect(sms.sent.filter((m) => m.to === registered.phone)).toEqual([{ to: registered.phone, body: welcomeText("Welcome") }]);
    const { data } = await serviceClient().from("welcome_texts").select("phone_hash, sent_at").eq("phone_hash", phoneHash(registered.phone, secret));
    expect(data).toHaveLength(1);
    expect(data?.[0]?.sent_at).not.toBeNull();
  });

  it("never welcomes a driver without consent", async () => {
    await service.onDriverSignedUp(noConsent.driverId, noConsent.phone);
    expect(sms.sent.filter((m) => m.to === noConsent.phone)).toEqual([]);
  });

  it("reminds a Registered driver of what is missing once, then not for 3 days", async () => {
    await reminders.send(adminId, { driverId: registered.driverId });
    expect(sms.sent.filter((m) => m.to === registered.phone).at(-1)).toEqual({
      to: registered.phone,
      body: docReminderText("CDL photos and medical card"),
    });
    const { data: log } = await serviceClient()
      .from("sms_messages")
      .select("kind, notice_batch_id")
      .eq("driver_id", registered.driverId)
      .eq("kind", "doc_reminder");
    expect(log).toHaveLength(1);
    expect(log?.[0]?.notice_batch_id).not.toBeNull();
    const again = await reminders.preview(adminId, { driverId: registered.driverId });
    expect(again.blocked).toBe("A documents reminder went to this driver in the last 3 days.");
    expect((await reminders.preview(adminId, { driverId: noConsent.driverId })).blocked).toBe("This driver has not agreed to texts.");
  });
});
