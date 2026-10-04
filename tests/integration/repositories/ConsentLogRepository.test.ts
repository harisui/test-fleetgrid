import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SMS_CONSENT_TEXT, SMS_CONSENT_VERSION } from "@/lib/constants";
import { ConsentLogRepository } from "@/server/repositories/ConsentLogRepository";
import { buildPhone } from "../../setup/factories";
import {
  anonClient,
  cleanupTestUsers,
  createTestUser,
  serviceClient,
  type TestUser,
} from "../../setup/supabase";

describe("ConsentLogRepository and sms_consent_log access (local Supabase)", () => {
  let driver: TestUser;
  let carrier: TestUser;
  let admin: TestUser;
  let phone: string;

  beforeAll(async () => {
    [driver, carrier, admin] = await Promise.all([
      createTestUser({ role: "driver" }),
      createTestUser({ role: "carrier" }),
      createTestUser({ role: "admin", status: "approved" }),
    ]);
    phone = driver.phone;
    await new ConsentLogRepository(serviceClient()).record({
      phone,
      event: "opt_in",
      consentText: SMS_CONSENT_TEXT,
      consentVersion: SMS_CONSENT_VERSION,
      source: "onboarding",
    });
  });

  afterAll(async () => {
    await serviceClient().from("sms_consent_log").delete().eq("phone", phone);
    await cleanupTestUsers();
  });

  it("the service role writes a row with the exact text and version", async () => {
    const { data } = await serviceClient().from("sms_consent_log").select("*").eq("phone", phone);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      event: "opt_in",
      consent_text: SMS_CONSENT_TEXT,
      consent_version: SMS_CONSENT_VERSION,
      source: "onboarding",
    });
  });

  it("a driver cannot read the log, not even their own number, and cannot write", async () => {
    const { data } = await driver.client.from("sms_consent_log").select("*");
    expect(data).toEqual([]);
    const { error } = await driver.client.from("sms_consent_log").insert({
      phone,
      event: "opt_out",
      consent_text: "STOP",
      consent_version: "2026-10-v1",
      source: "sms_stop",
    });
    expect(error?.code).toBe("42501");
  });

  it("a carrier and an anonymous visitor cannot read the log", async () => {
    const asCarrier = await carrier.client.from("sms_consent_log").select("*");
    expect(asCarrier.data).toEqual([]);
    const asAnon = await anonClient().from("sms_consent_log").select("*");
    expect(asAnon.error?.code).toBe("42501");
  });

  it("an admin reads the log but cannot change it", async () => {
    const { data } = await admin.client
      .from("sms_consent_log")
      .select("phone, event")
      .eq("phone", phone);
    expect(data).toEqual([{ phone, event: "opt_in" }]);
    const { error } = await admin.client.from("sms_consent_log").delete().eq("phone", phone);
    expect(error?.code).toBe("42501");
  });

  it("the row survives deleting the user it belongs to", async () => {
    // A throwaway user, created and deleted here so the shared cleanup never looks for it.
    const admin = serviceClient();
    const doomedPhone = buildPhone();
    const { data: created, error } = await admin.auth.admin.createUser({
      phone: doomedPhone,
      phone_confirm: true,
    });
    if (error || !created.user) throw new Error(`createUser failed: ${error?.message}`);
    await admin
      .from("profiles")
      .insert({ id: created.user.id, phone: doomedPhone, role: "driver" });
    await new ConsentLogRepository(admin).record({
      phone: doomedPhone,
      event: "opt_in",
      consentText: SMS_CONSENT_TEXT,
      consentVersion: SMS_CONSENT_VERSION,
      source: "onboarding",
    });

    await admin.auth.admin.deleteUser(created.user.id);

    const { data: profiles } = await admin.from("profiles").select("id").eq("id", created.user.id);
    expect(profiles).toEqual([]);
    const { data } = await admin.from("sms_consent_log").select("id").eq("phone", doomedPhone);
    expect(data).toHaveLength(1);
    await admin.from("sms_consent_log").delete().eq("phone", doomedPhone);
  });
});
