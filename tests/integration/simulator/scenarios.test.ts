import { randomUUID } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cdlStateNoticeText,
  docReminderText,
  policyChangeText,
  serviceNoticeText,
  SMS_ACCOUNT_SECURITY,
  SMS_ALREADY_BOOKED,
  SMS_APPROVED,
  SMS_NOT_ELIGIBLE,
  SMS_OVERLAP,
  SMS_PAUSED,
  SMS_SAMPLE_FILLED,
  welcomeText,
} from "@/content/sms-samples";
import { POST as inboundRoute } from "@/app/api/twilio/inbound/route";
import { resetEnvCache } from "@/lib/env";
import { bookedText, cancelledText, FORMAT_HELP_TEXT, offerText, SHIFT_TIME_ZONE } from "@/lib/shifts/texts";
import { smsSegments } from "@/lib/sms/segments";
import { buildTextingServices } from "@/server/container";
import { FakeSmsProvider, FAKE_FAILING_NUMBER } from "@/server/providers/SmsProvider";
import { FileZipProvider } from "@/server/providers/ZipProvider";
import { BroadcastRepository } from "@/server/repositories/BroadcastRepository";
import { DriverNotificationRepository } from "@/server/repositories/DriverNotificationRepository";
import { NoticeRepository } from "@/server/repositories/NoticeRepository";
import { ProfileRepository } from "@/server/repositories/ProfileRepository";
import { ServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import { ShiftRepository } from "@/server/repositories/ShiftRepository";
import { SmsLogRepository } from "@/server/repositories/SmsLogRepository";
import { TextingDriverRepository } from "@/server/repositories/TextingDriverRepository";
import { BroadcastService } from "@/server/services/BroadcastService";
import type { CarrierService } from "@/server/services/CarrierService";
import { DocReminderService } from "@/server/services/DocReminderService";
import { DriverNotificationService } from "@/server/services/DriverNotificationService";
import { NoticeService } from "@/server/services/NoticeService";
import { ShiftService } from "@/server/services/ShiftService";
import { TextService } from "@/server/services/TextService";
import { TWILIO_INBOUND_URL, twilioSignature } from "@/server/twilio/signature";
import {
  cleanupTestUsers,
  createListedDriver,
  createTestCarrier,
  createTestUser,
  REQUIRED_DOCUMENT_TYPES,
  serviceClient,
  TEST_PLACES,
  type TestDriver,
} from "../../setup/supabase";

vi.mock("server-only", () => ({}));

/**
 * The simulated phone test (Artifacts/simulator.md, part 2): every driver, carrier and admin text
 * flow, with fake phones. Real services, the real database, and every reply through the real
 * signed webhook route. Each scenario checks the exact words each phone received and the database
 * afterwards, and every text sent is checked for GSM-7 and one segment.
 */

const TOKEN = "simulator-auth-token";
const admin = serviceClient();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Noon in Houston today: every daytime rule is open, whatever the machine's clock says. */
const noon = (() => {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 18));
})();

const outbox = () => FakeSmsProvider.outbox;
/** What this phone received, in order. */
const phone = (number: string) => outbox().filter((text) => text.to === number).map((text) => text.body);

function services(now: Date = noon, carrierDisabled = false) {
  const clock = () => now;
  const shifts = new ShiftRepository(admin);
  const recipients = new BroadcastRepository(admin);
  const texts = new TextService(new FakeSmsProvider(), () => new SmsLogRepository(admin));
  const broadcast = new BroadcastService(shifts, recipients, texts, undefined, () => carrierDisabled);
  return {
    texts,
    broadcast,
    shifts,
    notifications: new DriverNotificationService(new DriverNotificationRepository(admin), texts, clock, "simulator-hash-secret"),
    reminders: new DocReminderService(new DriverNotificationRepository(admin), new NoticeRepository(admin), new ProfileRepository(admin), async () => undefined, texts, clock),
    notices: new NoticeService(new NoticeRepository(admin), new ProfileRepository(admin), async () => undefined, texts, clock),
    /** Posting as a carrier who is signed up and paying: those stages have their own tests. */
    shiftsFor: (carrierId: string) =>
      new ShiftService(
        { getAccess: async () => ({ stage: "ready", carrier: { id: carrierId } }) } as unknown as Pick<CarrierService, "getAccess">,
        shifts,
        recipients,
        { shifts: () => shifts, recipients: () => recipients, drivers: () => new TextingDriverRepository(admin) },
        new FileZipProvider(),
        new ServiceAreaRepository(admin),
        () => broadcast,
        texts,
        clock,
        () => carrierDisabled,
      ),
  };
}

/** A reply as Twilio sends it, to the real route. */
async function reply(from: string, body: string, extra: Record<string, string> = {}): Promise<number> {
  const params = { MessageSid: `SMsim${randomUUID().replaceAll("-", "")}`, From: from, To: "+18888692040", Body: body, AccountSid: "ACsim", ...extra };
  const response = await inboundRoute(
    new Request("http://localhost:3000/api/twilio/inbound", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(TOKEN, TWILIO_INBOUND_URL, params) },
      body: new URLSearchParams(params),
    }),
  );
  return response.status;
}

/** A form for a shift at this moment, as a carrier types it (Houston time), for eight hours. */
function form(start: Date, overrides: Record<string, unknown> = {}) {
  const end = new Date(start.getTime() + 8 * HOUR);
  return {
    zip: TEST_PLACES.pasadena.zip,
    date: formatInTimeZone(start, SHIFT_TIME_ZONE, "yyyy-MM-dd"),
    startTime: formatInTimeZone(start, SHIFT_TIME_ZONE, "HH:mm"),
    endTime: formatInTimeZone(end, SHIFT_TIME_ZONE, "HH:mm"),
    cdlClass: "A",
    endorsements: [],
    minYears: "0",
    equipmentTypes: [],
    workDescription: "Yard moves for the simulated phone test.",
    onsiteContactName: "Lee Yard",
    onsiteContactPhone: "713 555 0142",
    ...overrides,
  };
}

const inDays = (days: number) => new Date(noon.getTime() + days * DAY);
const FIELDS = { cdlClass: "A" as const, city: "Pasadena", state: "TX" };

const pasadena = (name: string, columns: Parameters<typeof createListedDriver>[0] = {}) =>
  createListedDriver({ fullName: name, place: TEST_PLACES.pasadena, ...columns });

async function logged(driverId: string, kind: string) {
  const { data } = await admin.from("sms_messages_current").select("status, body").eq("driver_id", driverId).eq("kind", kind);
  return data ?? [];
}

async function giveDocuments(driver: TestDriver) {
  const { error } = await admin.from("driver_documents").insert(
    REQUIRED_DOCUMENT_TYPES.map((type) => ({ driver_id: driver.driverId, type, storage_path: `${driver.driverId}/${type}.png`, file_name: `${type}.png`, mime_type: "image/png", size_bytes: 68 })),
  );
  if (error) throw error;
}

describe("simulated phones", () => {
  /** Other local drivers stay out of these sends, and are put back exactly as they were. */
  let quietened: string[] = [];

  beforeAll(async () => {
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    process.env.SMS_TEST_MODE = "true";
    delete process.env.CARRIER_DISABLED;
    resetEnvCache();
    const { data, error } = await admin.from("drivers").update({ shifts_paused: true }).eq("shifts_paused", false).select("id");
    if (error) throw error;
    quietened = (data ?? []).map((row) => row.id);
  }, 60_000);

  afterAll(async () => {
    if (quietened.length) await admin.from("drivers").update({ shifts_paused: false }).in("id", quietened);
    await cleanupTestUsers();
    delete process.env.TWILIO_AUTH_TOKEN;
    resetEnvCache();
  }, 120_000);

  beforeEach(() => {
    outbox().length = 0;
  });

  afterEach(() => {
    for (const text of outbox()) {
      const { encoding, segments } = smsSegments(text.body);
      expect(text.body.startsWith("FleetGrid: "), text.body).toBe(true);
      expect(encoding, text.body).toBe("GSM-7");
      expect(segments, text.body).toBe(1);
    }
  });

  it("a. sign-up with consent: the welcome, once per number. Without consent: no text at all", async () => {
    const wants = await createListedDriver({ fullName: "Wanda Agree", status: "pending" });
    const declines = await createListedDriver({ fullName: "Dee Decline", status: "pending", sms_opt_in: false, sms_opt_in_at: null, sms_opt_in_text: null });
    const { notifications } = services();

    await notifications.onDriverSignedUp(wants.driverId, wants.phone);
    await notifications.onDriverSignedUp(wants.driverId, wants.phone);
    await notifications.onDriverSignedUp(declines.driverId, declines.phone);

    expect(phone(wants.phone)).toEqual([welcomeText("Wanda")]);
    expect(phone(declines.phone)).toEqual([]);
    expect(await logged(declines.driverId, "welcome")).toEqual([]);
  });

  it("b. an admin marks Roster-Ready: the text, only with consent, and only once", async () => {
    const wants = await createListedDriver({ fullName: "Ray Ready", status: "pending" });
    const declines = await createListedDriver({ fullName: "Nell Noconsent", status: "pending", sms_opt_in: false, sms_opt_in_at: null, sms_opt_in_text: null });
    const stopped = await createListedDriver({ fullName: "Stan Stopped", status: "pending", sms_opted_out: true, sms_opted_out_at: new Date().toISOString() });
    const { notifications } = services();

    for (const driver of [wants, declines, stopped]) {
      await giveDocuments(driver);
      const { error } = await admin.from("profiles").update({ status: "approved" }).eq("id", driver.id);
      if (error) throw error;
      await notifications.onDriverApproved(driver.driverId);
      await notifications.onDriverApproved(driver.driverId);
    }

    expect(phone(wants.phone)).toEqual([SMS_APPROVED]);
    expect(phone(declines.phone)).toEqual([]);
    expect(phone(stopped.phone)).toEqual([]);
  });

  describe("c. missing documents", () => {
    let others: { id: string; last_doc_reminder_at: string | null }[] = [];
    const adminUser = () => createTestUser({ role: "admin", status: "approved" });

    beforeAll(async () => {
      const { data } = await admin.from("drivers").select("id, last_doc_reminder_at");
      others = data ?? [];
    });

    afterAll(async () => {
      for (const other of others) {
        await admin.from("drivers").update({ last_doc_reminder_at: other.last_doc_reminder_at }).eq("id", other.id);
      }
    }, 120_000);

    it("a single reminder names what is missing, and the 3-day limit holds", async () => {
      const driver = await createListedDriver({ fullName: "Cass Single", status: "pending" });
      const manager = await adminUser();
      const { reminders } = services();

      await reminders.send(manager.id, { driverId: driver.driverId, confirm: "" });
      expect(phone(driver.phone)).toEqual([docReminderText("CDL photos and medical card")]);

      await expect(reminders.send(manager.id, { driverId: driver.driverId, confirm: "" })).rejects.toThrow(/last 3 days/);
      expect(phone(driver.phone)).toHaveLength(1);
      expect((await admin.from("drivers").select("last_doc_reminder_at").eq("id", driver.driverId).single()).data?.last_doc_reminder_at).not.toBeNull();
    });

    it("the bulk reminder gives each driver their own wording; a STOP and no consent get nothing", async () => {
      const both = await createListedDriver({ fullName: "Bea Both", status: "pending" });
      const medicalOnly = await createListedDriver({ fullName: "Mo Medical", status: "pending" });
      await admin.from("driver_documents").insert(
        (["cdl_front", "cdl_back"] as const).map((type) => ({ driver_id: medicalOnly.driverId, type, storage_path: `${medicalOnly.driverId}/${type}.png`, file_name: `${type}.png`, mime_type: "image/png", size_bytes: 68 })),
      );
      const stopped = await createListedDriver({ fullName: "Stu Stop", status: "pending", sms_opted_out: true, sms_opted_out_at: new Date().toISOString() });
      const declines = await createListedDriver({ fullName: "Nan Noconsent", status: "pending", sms_opt_in: false, sms_opt_in_at: null, sms_opt_in_text: null });
      const manager = await adminUser();
      const { reminders } = services();

      const preview = await reminders.preview(manager.id, {});
      await expect(reminders.send(manager.id, { confirm: "SEND 0" })).rejects.toThrow();
      expect(phone(both.phone)).toEqual([]);
      await reminders.send(manager.id, { confirm: preview.confirmPhrase });

      expect(phone(both.phone)).toEqual([docReminderText("CDL photos and medical card")]);
      expect(phone(medicalOnly.phone)).toEqual([docReminderText("medical card")]);
      expect(phone(stopped.phone)).toEqual([]);
      expect(phone(declines.phone)).toEqual([]);
    });

    it("no CDL state and documents missing, in the grace period: one combined text, once", async () => {
      const graceUntil = new Date(noon.getTime() + 13 * DAY);
      // As production has them: approved before the rule, so written directly, with a one-word name.
      const driver = await createListedDriver({ fullName: "Gus", status: "approved", cdl_state: null, roster_grace_until: graceUntil.toISOString() });
      const { reminders } = services();

      await reminders.sendCdlStateNotices();
      await reminders.sendCdlStateNotices();

      const date = formatInTimeZone(graceUntil, SHIFT_TIME_ZONE, "MMM d");
      expect(phone(driver.phone)).toEqual([cdlStateNoticeText(date, "CDL photos and medical card")]);
    });
  });

  it("d. a carrier posts a shift: only matching, eligible drivers get the alert", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const match = await pasadena("Mia Match");
    const registered = await createListedDriver({ fullName: "Reg Istered", status: "pending", place: TEST_PLACES.pasadena });
    const paused = await pasadena("Paul Paused", { shifts_paused: true });
    const stopped = await pasadena("Opie Optedout", { sms_opted_out: true, sms_opted_out_at: new Date().toISOString() });
    const noConsent = await pasadena("Nora Noconsent", { sms_opt_in: false, sms_opt_in_at: null, sms_opt_in_text: null });
    const twicExpired = await pasadena("Tim Expired", { twic_expires_on: "2020-01-01" });
    const faraway = await createListedDriver({ fullName: "Far Away", place: TEST_PLACES.dallas });
    const capped = await pasadena("Cap Limit");
    const classB = await pasadena("Bo Classb", { cdl_class: "B" });
    const { error } = await admin.rpc("test_log_insert", {
      p_table: "sms_messages",
      p_rows: [1, 2, 3].map(() => ({ direction: "outbound", kind: "offer", from_phone: "fake", to_phone: capped.phone, body: "FleetGrid: earlier", status: "sent", driver_id: capped.driverId })),
    });
    if (error) throw error;

    const { shift, broadcast } = await services().shiftsFor(carrier.carrierId).postShift(carrier.id, form(inDays(3), { twicRequired: true }));

    expect(phone(match.phone)).toEqual([offerText({ ...FIELDS, startsAt: shift.startsAt }, shift.shortCode)]);
    for (const driver of [registered, paused, stopped, noConsent, twicExpired, faraway, capped, classB]) {
      expect(phone(driver.phone), driver.phone).toEqual([]);
    }
    expect(broadcast).toMatchObject({ failed: 0, skippedCap: 1 });
    const { data } = await admin.from("broadcast_recipients").select("driver_id, status").eq("shift_id", shift.id);
    const statusOf = (driver: TestDriver) => data?.find((row) => row.driver_id === driver.driverId)?.status;
    expect(statusOf(capped)).toBe("skipped_cap");
    expect(statusOf(match)).toBe("delivered");
    for (const driver of [registered, paused, stopped, noConsent, twicExpired, faraway, classB]) {
      expect(statusOf(driver), driver.phone).toBeUndefined();
    }
  });

  it("e. five phones reply YES at once: one booked, four already booked, and the carrier sees only the winner", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const drivers = await Promise.all([1, 2, 3, 4, 5].map((n) => pasadena(`Fay Five${n}`)));
    const world = services();
    const shiftService = world.shiftsFor(carrier.carrierId);
    const { shift } = await shiftService.postShift(carrier.id, form(inDays(3)));

    const statuses = await Promise.all(drivers.map((driver) => reply(driver.phone, `YES ${shift.shortCode}`)));
    expect(statuses).toEqual([200, 200, 200, 200, 200]);

    const offer = offerText({ ...FIELDS, startsAt: shift.startsAt }, shift.shortCode);
    const booked = bookedText({ ...FIELDS, startsAt: shift.startsAt });
    const winners = drivers.filter((driver) => phone(driver.phone).includes(booked));
    expect(winners).toHaveLength(1);
    expect(phone(winners[0]!.phone)).toEqual([offer, booked]);
    for (const loser of drivers.filter((driver) => driver !== winners[0])) {
      expect(phone(loser.phone)).toEqual([offer, SMS_SAMPLE_FILLED]);
    }

    expect(await new ShiftRepository(carrier.client).bookedDriverContact(shift.id)).toMatchObject({ driverId: winners[0]!.driverId, phone: winners[0]!.phone });
    const stranger = await createTestCarrier({ subscription: "active" });
    expect(await new ShiftRepository(stranger.client).bookedDriverContact(shift.id)).toBeNull();
    const detail = await shiftService.getCarrierShift(carrier.id, { shiftId: shift.id });
    expect(JSON.stringify(detail.recipients)).not.toMatch(/\+1555/);
    const { data } = await admin.from("shifts").select("status, booked_driver_id").eq("id", shift.id).single();
    expect(data).toEqual({ status: "booked", booked_driver_id: winners[0]!.driverId });
  });

  it("f. a driver with a booked shift replies YES to an overlapping one: the overlap text, nothing booked", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const driver = await pasadena("Olga Overlap");
    const world = services();
    const shiftService = world.shiftsFor(carrier.carrierId);
    const first = await shiftService.postShift(carrier.id, form(inDays(3)));
    await reply(driver.phone, `YES ${first.shift.shortCode}`);

    // Posted by raw insert, then offered: a booked driver gets no alert for an overlapping shift.
    const start = inDays(3);
    const { data: second, error } = await admin
      .from("shifts")
      .insert({ carrier_id: carrier.carrierId, short_code: "", starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 8 * HOUR).toISOString(), zip: "77506", city: "Pasadena", state: "TX", lat: 29.7009, lng: -95.1989, work_description: "The overlapping shift.", onsite_contact_name: "Lee Yard", onsite_contact_phone: "+17135550142" })
      .select("id, short_code")
      .single();
    if (error) throw error;
    await admin.from("broadcast_recipients").insert({ shift_id: second.id, driver_id: driver.driverId, round: 1, position: 1, code: second.short_code, status: "sent" });

    outbox().length = 0;
    await reply(driver.phone, `YES ${second.short_code}`);

    expect(phone(driver.phone)).toEqual([SMS_OVERLAP]);
    const { data } = await admin.from("shifts").select("status").eq("id", second.id).single();
    expect(data?.status).toBe("open");
  });

  it("g. a paused driver, an ineligible driver, a repeat YES: each gets its own reply, never silence", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const repeat = await pasadena("Rex Repeat");
    const paused = await pasadena("Pat Pausedlater");
    const removed = await pasadena("Rita Removed");
    const never = await createListedDriver({ fullName: "Ned Neveroffered", status: "pending", place: TEST_PLACES.pasadena });
    const { shift } = await services().shiftsFor(carrier.carrierId).postShift(carrier.id, form(inDays(3)));
    await admin.from("drivers").update({ shifts_paused: true }).eq("id", paused.driverId);
    await admin.from("profiles").update({ status: "pending" }).eq("id", removed.id);
    outbox().length = 0;

    await reply(paused.phone, `YES ${shift.shortCode}`);
    expect(phone(paused.phone)).toEqual([SMS_PAUSED]);

    await reply(removed.phone, `YES ${shift.shortCode}`);
    expect(phone(removed.phone)).toEqual([SMS_NOT_ELIGIBLE]);

    // Today's rule, listed as a finding in the report: a driver never offered this shift is told how to book.
    await reply(never.phone, `YES ${shift.shortCode}`);
    expect(phone(never.phone)).toEqual([FORMAT_HELP_TEXT]);

    await reply(repeat.phone, `YES ${shift.shortCode}`);
    await reply(repeat.phone, `YES ${shift.shortCode}`);
    expect(phone(repeat.phone)).toEqual([bookedText({ ...FIELDS, startsAt: shift.startsAt }), SMS_ALREADY_BOOKED]);
  });

  it("h. the carrier cancels a booked shift: the driver gets the cancellation text", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const driver = await pasadena("Cal Cancelled");
    const shiftService = services().shiftsFor(carrier.carrierId);
    const { shift } = await shiftService.postShift(carrier.id, form(inDays(3)));
    await reply(driver.phone, `YES ${shift.shortCode}`);
    outbox().length = 0;

    await shiftService.cancelShift(carrier.id, { shiftId: shift.id, reason: "plans_changed" });

    expect(phone(driver.phone)).toEqual([cancelledText({ ...FIELDS, startsAt: shift.startsAt })]);
    expect((await admin.from("shifts").select("status").eq("id", shift.id).single()).data?.status).toBe("cancelled");
  });

  it("i. released as a no-show: the rebroadcast skips that driver, and the second no-show pauses them", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const missed = await pasadena("Noah Noshow");
    const backup = await pasadena("Bev Backup");
    const shiftService = services().shiftsFor(carrier.carrierId);

    const first = await shiftService.postShift(carrier.id, form(inDays(3)));
    await reply(missed.phone, `YES ${first.shift.shortCode}`);
    await reply(backup.phone, "YES " + first.shift.shortCode);
    outbox().length = 0;
    const released = await shiftService.releaseShift(carrier.id, { shiftId: first.shift.id, reason: "no_show" });

    expect(released.shift.shortCode).not.toBe(first.shift.shortCode);
    expect(phone(missed.phone)).toEqual([]);
    expect(phone(backup.phone)).toEqual([offerText({ ...FIELDS, startsAt: first.shift.startsAt }, released.shift.shortCode)]);
    let row = (await admin.from("drivers").select("no_show_count, shifts_paused").eq("id", missed.driverId).single()).data;
    expect(row).toEqual({ no_show_count: 1, shifts_paused: false });

    const second = await shiftService.postShift(carrier.id, form(inDays(5)));
    await reply(missed.phone, `YES ${second.shift.shortCode}`);
    await shiftService.releaseShift(carrier.id, { shiftId: second.shift.id, reason: "no_show" });
    row = (await admin.from("drivers").select("no_show_count, shifts_paused").eq("id", missed.driverId).single()).data;
    expect(row).toEqual({ no_show_count: 2, shifts_paused: true });
  });

  it("j. HELP, STOP, START: the app syncs the state and sends nothing itself", async () => {
    const driver = await pasadena("Sid Stopper");

    expect(await reply(driver.phone, "HELP", { OptOutType: "HELP" })).toBe(200);
    expect(phone(driver.phone)).toEqual([]);

    await reply(driver.phone, "STOP", { OptOutType: "STOP" });
    expect(phone(driver.phone)).toEqual([]);
    expect((await admin.from("drivers").select("sms_opted_out").eq("id", driver.driverId).single()).data?.sms_opted_out).toBe(true);

    // A YES from a stopped number is Twilio's: logged, never answered, nothing booked.
    await reply(driver.phone, "YES 1234");
    expect(phone(driver.phone)).toEqual([]);

    const carrier = await createTestCarrier({ subscription: "active" });
    await services().shiftsFor(carrier.carrierId).postShift(carrier.id, form(inDays(3)));
    expect(phone(driver.phone)).toEqual([]);

    await reply(driver.phone, "START", { OptOutType: "START" });
    expect(phone(driver.phone)).toEqual([]);
    expect((await admin.from("drivers").select("sms_opted_out").eq("id", driver.driverId).single()).data?.sms_opted_out).toBe(false);
    const { data: consent } = await admin.from("sms_consent_log").select("event").eq("phone", driver.phone).order("created_at");
    expect(consent?.map((row) => row.event)).toEqual(expect.arrayContaining(["opt_out", "opt_in_again"]));
  });

  it("k. quiet hours: posted at 10 PM it waits for 7 AM, unless it starts within 12 hours", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const driver = await pasadena("Quinn Quiet");
    const tenPm = new Date(noon.getTime() + 2 * DAY + 10 * HOUR);
    const sevenAm = new Date(tenPm.getTime() + 9 * HOUR);
    const night = services(tenPm).shiftsFor(carrier.carrierId);

    const held = await night.postShift(carrier.id, form(inDays(5)));
    expect(held.broadcast).toBeNull();
    expect(new Date(held.shift.sendAfter!).getTime()).toBe(sevenAm.getTime());
    expect(phone(driver.phone)).toEqual([]);

    const soon = await night.postShift(carrier.id, form(new Date(tenPm.getTime() + 11 * HOUR)));
    expect(phone(driver.phone)).toEqual([offerText({ ...FIELDS, startsAt: soon.shift.startsAt }, soon.shift.shortCode)]);
    outbox().length = 0;

    expect(await services(new Date(sevenAm.getTime() - 60_000)).broadcast.dispatchDue(new Date(sevenAm.getTime() - 60_000))).toBe(0);
    expect(phone(driver.phone)).toEqual([]);
    await services(sevenAm).broadcast.dispatchDue(sevenAm);
    expect(phone(driver.phone)).toEqual([offerText({ ...FIELDS, startsAt: held.shift.startsAt }, held.shift.shortCode)]);
  }, 60_000);

  it("l. a send failure: the booked text retries, then the shift reads Booked, not notified", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const driver = await pasadena("Fred Failing");
    const { shift } = await services().shiftsFor(carrier.carrierId).postShift(carrier.id, form(inDays(3)));
    // The number stops working after the alert reached it.
    const { error } = await admin.from("profiles").update({ phone: FAKE_FAILING_NUMBER }).eq("id", driver.id);
    if (error) throw error;
    outbox().length = 0;

    const started = Date.now();
    await reply(FAKE_FAILING_NUMBER, `YES ${shift.shortCode}`);

    expect(Date.now() - started).toBeGreaterThan(4_500); // 500 + 1500 + 3000 between the four tries
    expect(phone(FAKE_FAILING_NUMBER)).toEqual([]);
    const row = (await admin.from("shifts").select("status, booked_driver_id, booked_notice_failed_at").eq("id", shift.id).single()).data;
    expect(row).toMatchObject({ status: "booked", booked_driver_id: driver.driverId });
    expect(row?.booked_notice_failed_at).not.toBeNull();
    expect(await logged(driver.driverId, "booked")).toEqual([expect.objectContaining({ status: "failed" })]);
  }, 60_000);

  it("m. the server stops mid-broadcast: the resume job sends the rest, exactly once", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const drivers = await Promise.all([1, 2, 3, 4].map((n) => pasadena(`Rae Resume${n}`)));
    const { shifts, broadcast } = services();
    const start = inDays(3);
    const { data: shift, error } = await admin
      .from("shifts")
      .insert({ carrier_id: carrier.carrierId, short_code: "", starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 8 * HOUR).toISOString(), zip: "77506", city: "Pasadena", state: "TX", lat: 29.7009, lng: -95.1989, work_description: "Cut off part way.", onsite_contact_name: "Lee Yard", onsite_contact_phone: "+17135550142", broadcast_round: 1 })
      .select("id, short_code")
      .single();
    if (error) throw error;
    const old = new Date(Date.now() - 5 * 60_000).toISOString();
    const { error: rowsError } = await admin.from("broadcast_recipients").insert(
      drivers.map((driver, index) => ({ shift_id: shift.id, driver_id: driver.driverId, round: 1, position: index + 1, code: shift.short_code, created_at: old, status: index === 0 ? ("sent" as const) : ("queued" as const) })),
    );
    if (rowsError) throw rowsError;

    // Two runs of the job at the same moment, by day.
    const [one, two] = await Promise.all([broadcast.resumeQueued(noon), services().broadcast.resumeQueued(noon)]);
    expect(one + two).toBe(3);
    expect(await broadcast.resumeQueued(noon)).toBe(0);

    const alert = offerText({ ...FIELDS, startsAt: start }, shift.short_code);
    expect(phone(drivers[0]!.phone)).toEqual([]);
    for (const driver of drivers.slice(1)) expect(phone(driver.phone)).toEqual([alert]);
    expect((await shifts.findById(shift.id))?.status).toBe("open");
  }, 60_000);

  describe("n. Send notice", () => {
    // The far future: the limits count the batches other test runs left behind.
    const later = new Date(Date.UTC(2031, 2, 12, 18));
    const manager = () => createTestUser({ role: "admin", status: "approved" });

    it("policy and service notices reach exactly the drivers who may get them", async () => {
      const wants = await createListedDriver({ fullName: "Nina Notice" });
      const stopped = await createListedDriver({ fullName: "Nick Stopped", sms_opted_out: true, sms_opted_out_at: new Date().toISOString() });
      const declines = await createListedDriver({ fullName: "Nate Noconsent", sms_opt_in: false, sms_opt_in_at: null, sms_opt_in_text: null });
      const boss = await manager();
      const { notices } = services(later);
      const policy = { category: "policy_change", policy: "privacy", date: "2031-03-20" };

      await notices.send(boss.id, { choices: policy, confirm: (await notices.preview(boss.id, policy)).confirmPhrase });
      expect(phone(wants.phone)).toEqual([policyChangeText("privacy", "Mar 20, 2031")]);
      expect(phone(stopped.phone)).toEqual([]);
      expect(phone(declines.phone)).toEqual([]);

      outbox().length = 0;
      const service = { category: "service_notice", service: "shift_texts", state: "delayed", time: "15:00" };
      await notices.send(boss.id, { choices: service, confirm: (await notices.preview(boss.id, service)).confirmPhrase });
      expect(phone(wants.phone)).toEqual([serviceNoticeText("shift_texts", "delayed", "3:00 PM")]);
      expect(phone(stopped.phone)).toEqual([]);
      expect(phone(declines.phone)).toEqual([]);
    }, 120_000);

    it("a security notice reaches the one driver named", async () => {
      const named = await createListedDriver({ fullName: "Sue Security" });
      const bystander = await createListedDriver({ fullName: "Ben Bystander" });
      const boss = await manager();
      const { notices } = services(later);

      await notices.send(boss.id, { choices: { category: "account_security", driverId: named.driverId }, confirm: "SEND 1" });

      expect(phone(named.phone)).toEqual([SMS_ACCOUNT_SECURITY]);
      expect(phone(bystander.phone)).toEqual([]);
    });
  });

  it("o. CARRIER_DISABLED=true: no path sends a shift alert, and account texts still work", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const driver = await pasadena("Otto Off", { status: "approved" });
    const live = await services().shiftsFor(carrier.carrierId).postShift(carrier.id, form(inDays(3)));
    await admin.from("broadcast_recipients").delete().eq("shift_id", live.shift.id);
    outbox().length = 0;

    process.env.CARRIER_DISABLED = "true";
    resetEnvCache();
    try {
      // The real wiring: the switch is read from the environment, as in production.
      const { broadcastService } = buildTextingServices();
      expect(await broadcastService.broadcast(live.shift.id, noon)).toMatchObject({ offered: 0, sent: 0 });
      expect(await broadcastService.dispatchDue(noon)).toBe(0);
      expect(await broadcastService.resumeQueued(noon)).toBe(0);
      await expect(services(noon, true).shiftsFor(carrier.carrierId).postShift(carrier.id, form(inDays(4)))).rejects.toThrow(/switched off/);
      expect(phone(driver.phone)).toEqual([]);

      const signup = await createListedDriver({ fullName: "Willa Welcome", status: "pending" });
      await services().notifications.onDriverSignedUp(signup.driverId, signup.phone);
      expect(phone(signup.phone)).toEqual([welcomeText("Willa")]);
    } finally {
      delete process.env.CARRIER_DISABLED;
      resetEnvCache();
    }
  });

  it("the webhook refuses a wrong signature, and nothing happens", async () => {
    const driver = await pasadena("Sig Forged");
    const params = { MessageSid: `SMsim${randomUUID().replaceAll("-", "")}`, From: driver.phone, To: "+18888692040", Body: "STOP" };
    const response = await inboundRoute(
      new Request("http://localhost:3000/api/twilio/inbound", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature("not-the-token", TWILIO_INBOUND_URL, params) },
        body: new URLSearchParams(params),
      }),
    );
    expect(response.status).toBe(403);
    expect((await admin.from("drivers").select("sms_opted_out").eq("id", driver.driverId).single()).data?.sms_opted_out).toBe(false);
  });
});
