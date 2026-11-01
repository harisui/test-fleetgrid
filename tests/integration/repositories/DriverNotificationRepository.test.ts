import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SMS_APPROVED } from "@/content/sms-samples";
import { DriverNotificationRepository } from "@/server/repositories/DriverNotificationRepository";
import { SmsLogRepository } from "@/server/repositories/SmsLogRepository";
import { DriverNotificationService } from "@/server/services/DriverNotificationService";
import { TextService } from "@/server/services/TextService";
import { RecordingSmsProvider } from "../../fakes/FakeShiftRepositories";
import { cleanupTestUsers, createListedDriver, serviceClient, type TestDriver } from "../../setup/supabase";

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
