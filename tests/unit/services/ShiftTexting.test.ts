// @vitest-environment node
import { SMS_ALREADY_BOOKED, SMS_NOT_ELIGIBLE, SMS_OVERLAP, SMS_PAUSED } from "@/content/sms-samples";
import { SmsSendError } from "@/server/providers/SmsProvider";
import { beforeEach, describe, expect, it } from "vitest";
import { SMS_SAMPLE_FILLED } from "@/content/sms-samples";
import { bookedText, CLOSED_TEXT, FORMAT_HELP_TEXT, offerText } from "@/lib/shifts/texts";
import { BroadcastService } from "@/server/services/BroadcastService";
import { InboundService } from "@/server/services/InboundService";
import { TextService } from "@/server/services/TextService";
import {
  buildShift,
  buildTextingDriver,
  FakeConsentLog,
  FakeShiftWorld,
  FakeSmsLog,
  RecordingSmsProvider,
} from "../../fakes/FakeShiftRepositories";

/** The broadcast loop with fakes: offers out, replies in, the right single answer back. */
describe("broadcasting and replies", () => {
  let world: FakeShiftWorld;
  let sms: RecordingSmsProvider;
  let smsLog: FakeSmsLog;
  let consentLog: FakeConsentLog;
  let broadcasts: BroadcastService;
  let inbound: InboundService;
  const drivers = [1, 2, 3, 4].map((n) => buildTextingDriver(n));
  const shift = buildShift();
  let sid = 0;
  const reply = (from: string, body: string, optOutType: string | null = null) =>
    inbound.handle({ sid: `SMin${++sid}`, from, to: "+18888692040", body, optOutType });

  beforeEach(() => {
    world = new FakeShiftWorld();
    for (const driver of drivers) world.addDriver(driver);
    world.matching = drivers.map((d) => d.driverId);
    world.shifts.set(shift.id, shift);
    sms = new RecordingSmsProvider();
    smsLog = new FakeSmsLog();
    consentLog = new FakeConsentLog();
    const texts = new TextService(sms, () => smsLog);
    broadcasts = new BroadcastService(world.shiftRepository, world.broadcastRepository, texts, () => 0.5);
    inbound = new InboundService(
      world.textingDrivers,
      world.shiftRepository,
      world.broadcastRepository,
      smsLog,
      consentLog,
      texts,
      world.now,
    );
  });

  it("texts every match the approved alert with the shift's code, and records each", async () => {
    const result = await broadcasts.broadcast(shift.id, world.now());
    expect(result).toMatchObject({ round: 1, matched: 4, offered: 4, sent: 4, failed: 0 });
    expect(sms.sent.map((m) => m.body)).toEqual(Array(4).fill(offerText(shift, "4821")));
    expect(new Set(sms.sent.map((m) => m.to))).toEqual(new Set(drivers.map((d) => d.phone)));
    expect(world.recipients.map((r) => r.status)).toEqual(["sent", "sent", "sent", "sent"]);
    expect(world.recipients.map((r) => r.position).sort()).toEqual([1, 2, 3, 4]);
    expect(world.shifts.get(shift.id)).toMatchObject({ broadcastRound: 1 });
    expect(smsLog.outbound()).toHaveLength(4);
  });

  describe("with CARRIER_DISABLED on", () => {
    const off = () => new BroadcastService(world.shiftRepository, world.broadcastRepository, new TextService(sms, () => smsLog), () => 0.5, () => true);

    it("no broadcast sends anything or moves the shift on", async () => {
      expect((await off().broadcast(shift.id, world.now())).offered).toBe(0);
      expect(sms.sent).toEqual([]);
      expect(world.recipients).toEqual([]);
      expect(world.shifts.get(shift.id)).toMatchObject({ broadcastRound: shift.broadcastRound });
    });

    it("the 7 AM run sends nothing, and the held shift waits", async () => {
      const held = { ...shift, sendAfter: "2026-10-01T12:00:00.000Z" };
      world.shifts.set(shift.id, held);
      expect(await off().dispatchDue(world.now())).toBe(0);
      expect(sms.sent).toEqual([]);
      expect(world.shifts.get(shift.id)?.sendAfter).toBe(held.sendAfter);
      // Switched back on, it goes.
      expect(await broadcasts.dispatchDue(world.now())).toBe(1);
      expect(sms.sent.length).toBeGreaterThan(0);
    });
  });

  describe("the alert cap", () => {
    it("a driver at the limit gets nothing and is on record as skipped", async () => {
      world.atCap.add(drivers[0].driverId);
      const result = await broadcasts.broadcast(shift.id, world.now());
      expect(result).toMatchObject({ matched: 4, offered: 3, sent: 3, skippedCap: 1 });
      expect(sms.sent.map((m) => m.to)).not.toContain(drivers[0].phone);
      expect(world.recipients.find((r) => r.driverId === drivers[0].driverId)?.status).toBe("skipped_cap");
    });
  });

  describe("a cut-off broadcast", () => {
    const daytime = new Date("2026-11-01T18:00:00.000Z"); // Noon Houston
    const queueWithoutSending = () =>
      world.broadcastRepository.insertMany(
        drivers.map((driver, index) => ({ shiftId: shift.id, driverId: driver.driverId, round: 1, position: index + 1, code: shift.shortCode })),
      );

    it("the job sends what is still queued, once each", async () => {
      const rows = await queueWithoutSending();
      await world.broadcastRepository.claimSend(rows[0]!.id);
      expect(await broadcasts.resumeQueued(daytime)).toBe(3);
      expect(sms.sent.map((m) => m.to).sort()).toEqual(drivers.slice(1).map((d) => d.phone).sort());
      expect(await broadcasts.resumeQueued(daytime)).toBe(0);
      expect(sms.sent).toHaveLength(3);
    });

    it("respects the cap, and quiet hours", async () => {
      await queueWithoutSending();
      world.atCap.add(drivers[0].driverId);
      // The shift starts Nov 3: more than 12 hours from 11 PM Houston, so it waits.
      const night = new Date("2026-11-01T05:00:00.000Z");
      expect(await broadcasts.resumeQueued(night)).toBe(0);
      expect(sms.sent).toEqual([]);
      expect(await broadcasts.resumeQueued(daytime)).toBe(3);
      expect(world.recipients.find((r) => r.driverId === drivers[0].driverId)?.status).toBe("skipped_cap");
    });

    it("sends nothing with the carrier side off", async () => {
      await queueWithoutSending();
      const off = new BroadcastService(world.shiftRepository, world.broadcastRepository, new TextService(sms, () => smsLog), () => 0.5, () => true);
      expect(await off.resumeQueued(daytime)).toBe(0);
      expect(sms.sent).toEqual([]);
    });
  });

  describe("every YES gets an answer", () => {
    const yes = (driver: (typeof drivers)[number], sid: string) =>
      inbound.handle({ sid, from: driver.phone, to: "+18888692040", body: `YES ${shift.shortCode}` });
    const lastText = () => sms.sent.at(-1)?.body;

    beforeEach(async () => {
      await broadcasts.broadcast(shift.id, world.now());
    });

    it("overlap: told, not booked", async () => {
      world.overlapping.add(drivers[0].driverId);
      expect((await yes(drivers[0], "SMa1")).outcome).toBe("overlap");
      expect(lastText()).toBe(SMS_OVERLAP);
      expect(world.shifts.get(shift.id)?.status).toBe("open");
      expect(smsLog.entries.find((e) => e.providerSid === "SMa1")?.inboundOutcome).toBe("overlap");
    });

    it("paused: told, not booked", async () => {
      world.drivers.get(drivers[0].driverId)!.shiftsPaused = true;
      expect((await yes(drivers[0], "SMa2")).outcome).toBe("not_eligible");
      expect(lastText()).toBe(SMS_PAUSED);
    });

    it("no longer eligible: told, not booked", async () => {
      world.drivers.get(drivers[0].driverId)!.status = "pending";
      expect((await yes(drivers[0], "SMa3")).outcome).toBe("not_eligible");
      expect(lastText()).toBe(SMS_NOT_ELIGIBLE);
    });

    it("repeat YES on a shift they hold: told, nothing new booked", async () => {
      await yes(drivers[0], "SMa4");
      expect(lastText()).toContain("Your shift is booked");
      expect((await yes(drivers[0], "SMa5")).outcome).toBe("already_yours");
      expect(lastText()).toBe(SMS_ALREADY_BOOKED);
    });
  });

  describe("a booked text that fails", () => {
    const yes = () => inbound.handle({ sid: "SMb1", from: drivers[0].phone, to: "+18888692040", body: `YES ${shift.shortCode}` });

    beforeEach(async () => {
      await broadcasts.broadcast(shift.id, world.now());
    });

    function retrying(failures: number, code: string | null = "30003") {
      let left = failures;
      const waits: number[] = [];
      const provider = {
        kind: "fake" as const,
        sender: "fake",
        send: async (message: { to: string; body: string }) => {
          if (left-- > 0) throw new SmsSendError("refused", code);
          return sms.send(message);
        },
      };
      const texts = new TextService(provider, () => smsLog, undefined, async (ms) => {
        waits.push(ms);
      });
      inbound = new InboundService(world.textingDrivers, world.shiftRepository, world.broadcastRepository, smsLog, consentLog, texts, world.now);
      return waits;
    }

    it("retries three times with backoff, then sends: one log row, no alarm", async () => {
      const waits = retrying(3);
      const before = sms.sent.length;
      expect((await yes()).replied).toBe("booked");
      expect(waits).toEqual([500, 1500, 3000]);
      expect(sms.sent.length).toBe(before + 1);
      expect(smsLog.outbound().filter((e) => e.kind === "booked")).toHaveLength(1);
      expect(world.shifts.get(shift.id)?.bookedNoticeFailedAt).toBeNull();
    });

    it("after three retries the admin is told: Booked, not notified", async () => {
      retrying(4);
      expect((await yes()).outcome).toBe("won");
      expect(world.shifts.get(shift.id)?.status).toBe("booked");
      expect(world.shifts.get(shift.id)?.bookedNoticeFailedAt).toBeTruthy();
      expect(smsLog.outbound().find((e) => e.kind === "booked")?.status).toBe("failed");
    });

    it("does not retry a number that will answer the same every time", async () => {
      const waits = retrying(4, "21610");
      await yes();
      expect(waits).toEqual([]);
      expect(world.shifts.get(shift.id)?.bookedNoticeFailedAt).toBeTruthy();
    });

    it("a delivery report of failure raises it, and delivered clears it", async () => {
      await yes();
      const sid = smsLog.outbound().find((e) => e.kind === "booked")!.providerSid!;
      await inbound.handleStatus({ sid, status: "undelivered", errorCode: "30005" });
      expect(world.shifts.get(shift.id)?.bookedNoticeFailedAt).toBeTruthy();
      await inbound.handleStatus({ sid, status: "delivered", errorCode: null });
      expect(world.shifts.get(shift.id)?.bookedNoticeFailedAt).toBeNull();
    });
  });

  describe("a lost YES", () => {
    const message = () => ({ sid: "SMc1", from: drivers[0].phone, to: "+18888692040", body: `YES ${shift.shortCode}` });

    beforeEach(async () => {
      await broadcasts.broadcast(shift.id, world.now());
    });

    it("a reply that stopped part way is handled by the retry, not dropped", async () => {
      const claim = world.shiftRepository.claim;
      world.shiftRepository.claim = async () => {
        throw new Error("the server stopped");
      };
      await expect(inbound.handle(message())).rejects.toThrow("the server stopped");
      expect(world.shifts.get(shift.id)?.status).toBe("open");
      world.shiftRepository.claim = claim;

      // Inside the 60 seconds another delivery of it waits; after them it is handled.
      expect((await inbound.handle(message())).duplicate).toBe(true);
      smsLog.staleInbound.add("SMc1");
      expect((await inbound.handle(message())).outcome).toBe("won");
      expect(world.shifts.get(shift.id)?.bookedDriverId).toBe(drivers[0].driverId);
    });

    it("the job handles it when Twilio never retries", async () => {
      const claim = world.shiftRepository.claim;
      world.shiftRepository.claim = async () => {
        throw new Error("the server stopped");
      };
      await expect(inbound.handle(message())).rejects.toThrow();
      world.shiftRepository.claim = claim;
      smsLog.staleInbound.add("SMc1");
      expect(await inbound.reprocessUnfinished(world.now())).toBe(1);
      expect(world.shifts.get(shift.id)?.bookedDriverId).toBe(drivers[0].driverId);
      expect(await inbound.reprocessUnfinished(world.now())).toBe(0);
    });

    it("a finished reply delivered again is a duplicate", async () => {
      await inbound.handle(message());
      const texts = sms.sent.length;
      expect((await inbound.handle(message())).duplicate).toBe(true);
      expect(sms.sent).toHaveLength(texts);
    });
  });

  it("a shift paused by a carrier block sends nothing", async () => {
    world.shifts.set(shift.id, { ...shift, carrierPausedAt: "2026-11-01T11:00:00.000Z" });
    expect((await broadcasts.broadcast(shift.id, world.now())).offered).toBe(0);
    expect(sms.sent).toEqual([]);
  });

  it("a refused send is recorded and the rest still go", async () => {
    sms.failing.add(drivers[1].phone);
    const result = await broadcasts.broadcast(shift.id, world.now());
    expect(result).toMatchObject({ sent: 3, failed: 1 });
    expect(world.recipients.find((r) => r.driverId === drivers[1].driverId)).toMatchObject({ status: "failed", errorCode: "30003" });
  });

  it("does nothing for a shift that is not open or has started", async () => {
    world.shifts.set(shift.id, { ...shift, status: "cancelled", cancelledAt: shift.createdAt });
    expect((await broadcasts.broadcast(shift.id, world.now())).offered).toBe(0);
    world.shifts.set(shift.id, { ...shift, startsAt: "2026-11-01T11:00:00.000Z" });
    expect((await broadcasts.broadcast(shift.id, world.now())).offered).toBe(0);
    expect(sms.sent).toHaveLength(0);
  });

  it("sends held broadcasts when their time comes", async () => {
    world.shifts.set(shift.id, { ...shift, sendAfter: "2026-11-02T13:00:00.000Z" });
    expect(await broadcasts.dispatchDue(new Date("2026-11-02T12:59:00.000Z"))).toBe(0);
    expect(await broadcasts.dispatchDue(new Date("2026-11-02T13:00:00.000Z"))).toBe(1);
    expect(sms.sent).toHaveLength(4);
    expect(world.shifts.get(shift.id)?.sendAfter).toBeNull();
  });

  it("YES with the code books it and only the winner gets the booked text", async () => {
    await broadcasts.broadcast(shift.id, world.now());
    sms.sent = [];
    const won = await reply(drivers[2].phone, "yes 4821");
    expect(won).toMatchObject({ intent: "yes", outcome: "won", replied: "booked" });
    expect(sms.sent).toEqual([{ to: drivers[2].phone, body: bookedText(shift) }]);
    expect(world.shifts.get(shift.id)).toMatchObject({ status: "booked", bookedDriverId: drivers[2].driverId });

    const late = await reply(drivers[0].phone, "YES 4821");
    expect(late).toMatchObject({ outcome: "filled", replied: "filled" });
    expect(sms.sent[1]).toEqual({ to: drivers[0].phone, body: SMS_SAMPLE_FILLED });
    // No blast: the other two drivers heard nothing.
    expect(sms.sent).toHaveLength(2);
  });

  it("a bare YES books the one open offer, and asks for the code when there are two", async () => {
    await broadcasts.broadcast(shift.id, world.now());
    expect(await reply(drivers[0].phone, "YES")).toMatchObject({ outcome: "won" });

    const second = buildShift({ id: "50000000-0000-4000-8000-000000000002", shortCode: "1111" });
    const third = buildShift({ id: "50000000-0000-4000-8000-000000000003", shortCode: "2222" });
    world.shifts.set(second.id, second);
    world.shifts.set(third.id, third);
    await broadcasts.broadcast(second.id, world.now());
    await broadcasts.broadcast(third.id, world.now());
    sms.sent = [];
    expect(await reply(drivers[1].phone, "Yes")).toMatchObject({ outcome: null, replied: "format_help" });
    expect(sms.sent).toEqual([{ to: drivers[1].phone, body: FORMAT_HELP_TEXT }]);
  });

  it("a code never sent and a message it cannot read get the how-to-book reply", async () => {
    await broadcasts.broadcast(shift.id, world.now());
    sms.sent = [];
    expect(await reply(drivers[0].phone, "YES 9999")).toMatchObject({ outcome: "not_found", replied: "format_help" });
    expect(await reply(drivers[0].phone, "what time?")).toMatchObject({ intent: "other", replied: "format_help" });
    expect(sms.sent.map((m) => m.body)).toEqual([FORMAT_HELP_TEXT, FORMAT_HELP_TEXT]);
  });

  it("a YES for a shift that has started gets the closed reply", async () => {
    await broadcasts.broadcast(shift.id, world.now());
    world.shifts.set(shift.id, { ...world.shifts.get(shift.id)!, startsAt: "2026-11-01T11:00:00.000Z" });
    sms.sent = [];
    expect(await reply(drivers[0].phone, "YES 4821")).toMatchObject({ outcome: "closed", replied: "closed" });
    expect(sms.sent[0].body).toBe(CLOSED_TEXT);
  });

  it("STOP, START and HELP are logged and synced but never answered (no double reply)", async () => {
    await broadcasts.broadcast(shift.id, world.now());
    sms.sent = [];
    const driver = drivers[3];
    for (const word of ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "HELP", "INFO", "START", "UNSTOP"]) {
      await reply(driver.phone, word);
    }
    // Twilio's Advanced Opt-Out answers these; FleetGrid sent nothing.
    expect(sms.sent).toHaveLength(0);
    expect(consentLog.entries.map((e) => [e.event, e.source, e.consentText])).toEqual([
      ["opt_out", "sms_stop", "STOP"],
      ["opt_in_again", "sms_start", "START"],
    ]);
    expect(world.drivers.get(driver.driverId)?.smsOptedOut).toBe(false);
  });

  it("a bare YES from a number that opted out is Twilio's opt-in, not a booking", async () => {
    await broadcasts.broadcast(shift.id, world.now());
    await reply(drivers[0].phone, "STOP", "STOP");
    sms.sent = [];
    const result = await reply(drivers[0].phone, "YES");
    expect(result).toMatchObject({ intent: "opt_in", outcome: null, replied: null });
    expect(sms.sent).toHaveLength(0);
    expect(world.shifts.get(shift.id)?.status).toBe("open");
    expect(world.drivers.get(drivers[0].driverId)?.smsOptedOut).toBe(false);
  });

  it("the same message delivered twice is handled once", async () => {
    await broadcasts.broadcast(shift.id, world.now());
    sms.sent = [];
    const message = { sid: "SMdup", from: drivers[0].phone, to: "+18888692040", body: "YES 4821" };
    expect(await inbound.handle(message)).toMatchObject({ outcome: "won" });
    expect(await inbound.handle(message)).toMatchObject({ duplicate: true, outcome: null });
    expect(sms.sent).toHaveLength(1);
  });

  it("an unknown number is logged and gets nothing", async () => {
    expect(await reply("+15555559999", "YES 4821")).toMatchObject({ intent: "yes", outcome: null, replied: null });
    expect(smsLog.entries).toHaveLength(1);
    expect(sms.sent).toHaveLength(0);
  });

  it("never texts a number that opted out, and logs a refused send with its error", async () => {
    const texts = new TextService(sms, () => smsLog);
    expect(await texts.send({ ...drivers[0], smsOptedOut: true }, "approved", "x")).toMatchObject({ sent: false, status: "skipped_opted_out" });
    expect(sms.sent).toHaveLength(0);
    sms.failing.add(drivers[1].phone);
    expect(await texts.send(drivers[1], "approved", "x")).toMatchObject({ sent: false, status: "failed", errorCode: "30003" });
    expect(smsLog.outbound().at(-1)).toMatchObject({ toPhone: drivers[1].phone, status: "failed", errorCode: "30003" });
  });

  it("a second broadcast of the same round sends nothing (another call got there first)", async () => {
    await broadcasts.broadcast(shift.id, world.now());
    // Put the round back as if the second call had read the shift before the first wrote it.
    world.shifts.set(shift.id, { ...world.shifts.get(shift.id)!, broadcastRound: 0 });
    sms.sent = [];
    expect(await broadcasts.broadcast(shift.id, world.now())).toMatchObject({ offered: 0, sent: 0 });
    expect(sms.sent).toHaveLength(0);
  });

  it("delivery reports reach the offer, never over a booking", async () => {
    await broadcasts.broadcast(shift.id, world.now());
    const [first, second] = world.recipients;
    await inbound.handleStatus({ sid: first.messageSid!, status: "delivered", errorCode: null });
    await inbound.handleStatus({ sid: second.messageSid!, status: "undelivered", errorCode: "30005" });
    expect(first.status).toBe("delivered");
    expect(second).toMatchObject({ status: "failed", errorCode: "30005" });
    first.status = "booked";
    await inbound.handleStatus({ sid: first.messageSid!, status: "delivered", errorCode: null });
    expect(first.status).toBe("booked");
  });
});
