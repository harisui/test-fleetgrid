// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseServerEnv } from "@/lib/env";
import { createSmsProvider, FakeSmsProvider, HeldSmsProvider, TwilioSmsProvider } from "@/server/providers/SmsProvider";
import { TextService } from "@/server/services/TextService";
import { FakeSmsLog, RecordingSmsProvider } from "../../fakes/FakeShiftRepositories";

const DAY = new Date("2026-11-05T17:00:00.000Z"); // 11 AM Houston
const NIGHT = new Date("2026-11-06T04:00:00.000Z"); // 10 PM Houston
const ME = { driverId: "d1", phone: "+15555553001", smsOptedOut: false };
const base = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};
const keys = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_MESSAGING_SERVICE_SID: "MG1" };
const consenting = { findById: async () => ({ smsOptIn: true, smsOptedOut: false }) };

describe("texts in production without a real sender", () => {
  it("production never uses the fake: no keys, a missing key or test mode all hold", () => {
    const production = { ...base, VERCEL_ENV: "production" };
    expect(createSmsProvider(parseServerEnv(production))).toBeInstanceOf(HeldSmsProvider);
    expect(createSmsProvider(parseServerEnv({ ...production, ...keys, TWILIO_AUTH_TOKEN: "" }))).toBeInstanceOf(HeldSmsProvider);
    expect(createSmsProvider(parseServerEnv({ ...production, ...keys, SMS_TEST_MODE: "true" }))).toBeInstanceOf(HeldSmsProvider);
    expect(createSmsProvider(parseServerEnv({ ...production, ...keys }))).toBeInstanceOf(TwilioSmsProvider);
  });

  it("anywhere else without keys is still the fake", () => {
    expect(createSmsProvider(parseServerEnv(base))).toBeInstanceOf(FakeSmsProvider);
    expect(createSmsProvider(parseServerEnv({ ...base, VERCEL_ENV: "preview" }))).toBeInstanceOf(FakeSmsProvider);
  });

  it("a held text is logged held, not sent and not dropped, and calls nothing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const log = new FakeSmsLog();
    const outcome = await new TextService(new HeldSmsProvider(), () => log).send(ME, "welcome", "FleetGrid: hello");
    expect(outcome).toMatchObject({ sent: false, status: "held", sid: null });
    expect(log.outbound()).toEqual([expect.objectContaining({ status: "held", kind: "welcome", body: "FleetGrid: hello" })]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("once a sender is set, held texts go once, by day, with the provider's answer on the row", async () => {
    const log = new FakeSmsLog();
    await new TextService(new HeldSmsProvider(), () => log).send(ME, "welcome", "FleetGrid: hello");
    const sms = new RecordingSmsProvider();
    const service = new TextService(sms, () => log);

    expect(await service.drainHeld(consenting, NIGHT)).toBe(0);
    expect(sms.sent).toEqual([]);

    expect(await service.drainHeld(consenting, DAY)).toBe(1);
    expect(sms.sent).toEqual([{ to: ME.phone, body: "FleetGrid: hello" }]);
    expect(log.outbound()[0]).toMatchObject({ status: "queued" });
    expect(log.outbound()[0]?.providerSid).toBeTruthy();

    expect(await service.drainHeld(consenting, DAY)).toBe(0);
    expect(sms.sent).toHaveLength(1);
  });

  it("still holding: nothing is drained", async () => {
    const log = new FakeSmsLog();
    const service = new TextService(new HeldSmsProvider(), () => log);
    await service.send(ME, "welcome", "FleetGrid: hello");
    expect(await service.drainHeld(consenting, DAY)).toBe(0);
    expect(log.outbound()[0]?.status).toBe("held");
  });

  it.each([
    ["replied STOP", { smsOptIn: true, smsOptedOut: true }],
    ["turned texts off", { smsOptIn: false, smsOptedOut: false }],
    ["deleted the account", null],
  ])("a driver who %s since never gets it", async (_label, driver) => {
    const log = new FakeSmsLog();
    await new TextService(new HeldSmsProvider(), () => log).send(ME, "reminder", "FleetGrid: later");
    const sms = new RecordingSmsProvider();
    expect(await new TextService(sms, () => log).drainHeld({ findById: async () => driver }, DAY)).toBe(0);
    expect(sms.sent).toEqual([]);
    expect(log.outbound()[0]?.status).toBe("skipped_opted_out");
  });

  it("a shift alert is never sent late", async () => {
    const log = new FakeSmsLog();
    await new TextService(new HeldSmsProvider(), () => log).send(ME, "offer", "FleetGrid: New shift");
    const sms = new RecordingSmsProvider();
    expect(await new TextService(sms, () => log).drainHeld(consenting, DAY)).toBe(0);
    expect(sms.sent).toEqual([]);
  });

  it("a send that fails is recorded failed and does not stop the others", async () => {
    const log = new FakeSmsLog();
    const holding = new TextService(new HeldSmsProvider(), () => log);
    await holding.send(ME, "welcome", "FleetGrid: one");
    await holding.send({ ...ME, driverId: "d2", phone: "+15555553002" }, "welcome", "FleetGrid: two");
    const sms = new RecordingSmsProvider();
    sms.failing.add(ME.phone);
    expect(await new TextService(sms, () => log).drainHeld(consenting, DAY)).toBe(1);
    expect(log.outbound().map((entry) => entry.status)).toEqual(["failed", "queued"]);
  });
});
