import { afterAll, describe, expect, it } from "vitest";
import { SMS_OVERLAP } from "@/content/sms-samples";
import { HeldSmsProvider } from "@/server/providers/SmsProvider";
import { BroadcastRepository } from "@/server/repositories/BroadcastRepository";
import { ConsentLogRepository } from "@/server/repositories/ConsentLogRepository";
import { ShiftRepository } from "@/server/repositories/ShiftRepository";
import { SmsLogRepository } from "@/server/repositories/SmsLogRepository";
import { TextingDriverRepository } from "@/server/repositories/TextingDriverRepository";
import { BroadcastService } from "@/server/services/BroadcastService";
import { InboundService } from "@/server/services/InboundService";
import { TextService } from "@/server/services/TextService";
import { RecordingSmsProvider } from "../../fakes/FakeShiftRepositories";
import {
  cleanupTestUsers,
  createListedDriver,
  createTestCarrier,
  serviceClient,
  TEST_PLACES,
  type TestDriver,
} from "../../setup/supabase";

const SENDER = "+15555559999";
const seq = (() => {
  let n = 0;
  return () => `SMlogic${Date.now()}x${++n}`;
})();

function services(sms: RecordingSmsProvider) {
  const admin = serviceClient();
  const shifts = new ShiftRepository(admin);
  const recipients = new BroadcastRepository(admin);
  const texts = new TextService(sms, () => new SmsLogRepository(admin));
  return {
    shifts,
    broadcast: new BroadcastService(shifts, recipients, texts),
    inbound: new InboundService(
      new TextingDriverRepository(admin),
      shifts,
      recipients,
      new SmsLogRepository(admin),
      new ConsentLogRepository(admin),
      texts,
    ),
  };
}

async function postShift(carrierId: string): Promise<{ id: string; code: string }> {
  const start = new Date(Date.now() + 30 * 3_600_000);
  const { data, error } = await serviceClient()
    .from("shifts")
    .insert({
      carrier_id: carrierId,
      short_code: "",
      starts_at: start.toISOString(),
      ends_at: new Date(start.getTime() + 8 * 3_600_000).toISOString(),
      zip: TEST_PLACES.pasadena.zip,
      city: TEST_PLACES.pasadena.city,
      state: TEST_PLACES.pasadena.state,
      lat: TEST_PLACES.pasadena.lat,
      lng: TEST_PLACES.pasadena.lng,
      work_description: "Yard moves for the broadcast logic test.",
      onsite_contact_name: "Lee Yard",
      onsite_contact_phone: "+17135550142",
    })
    .select("id, short_code")
    .single();
  if (error) throw error;
  return { id: data.id, code: data.short_code };
}

const makeDrivers = async (count: number, name: string): Promise<TestDriver[]> => {
  const drivers: TestDriver[] = [];
  for (let start = 0; start < count; start += 10) {
    const batch = Array.from({ length: Math.min(10, count - start) }, (_, i) =>
      createListedDriver({ fullName: `${name} ${start + i}`, place: TEST_PLACES.pasadena }),
    );
    drivers.push(...(await Promise.all(batch)));
  }
  return drivers;
};

/** Everyone else in the local database stays out of these counts. */
const pauseOthers = async (name: string) => {
  const { error } = await serviceClient().from("drivers").update({ shifts_paused: true }).not("full_name", "like", `${name}%`);
  if (error) throw error;
};
const resumeEveryone = () => serviceClient().from("drivers").update({ shifts_paused: false }).eq("shifts_paused", true);

/**
 * Broadcasting against the real database: what fakes cannot prove. Ten drivers reply YES at the
 * same moment and exactly one books; a text delivered twice is handled once; and 200 drivers
 * get one text each, with realistic time for each send.
 */
describe("broadcast logic on the real database", () => {
  afterAll(async () => {
    await resumeEveryone();
    await cleanupTestUsers();
  });

  it("ten drivers reply YES at the same moment: one books, nine are told it is booked", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const drivers = await makeDrivers(10, "Race Driver");
    await pauseOthers("Race Driver");
    const sms = new RecordingSmsProvider();
    const { broadcast, inbound, shifts } = services(sms);
    const shift = await postShift(carrier.carrierId);

    const result = await broadcast.broadcast(shift.id);
    expect(result).toMatchObject({ offered: 10, sent: 10, failed: 0 });
    const replies = await Promise.all(
      drivers.map((driver) => inbound.handle({ sid: seq(), from: driver.phone, to: SENDER, body: `YES ${shift.code}` })),
    );

    const outcomes = replies.map((reply) => reply.outcome);
    expect(outcomes.filter((outcome) => outcome === "won")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "filled")).toHaveLength(9);
    const winner = drivers[outcomes.indexOf("won")]!;
    expect((await shifts.findById(shift.id))?.bookedDriverId).toBe(winner.driverId);
    const answers = sms.sent.filter((text) => !text.body.includes("New shift"));
    expect(answers).toHaveLength(10);
    expect(answers.filter((text) => text.body.includes("Your shift is booked")).map((text) => text.to)).toEqual([winner.phone]);
    expect(answers.filter((text) => text.body.includes("already booked"))).toHaveLength(9);
  }, 120_000);

  it("the same reply delivered twice at once is handled once; a second YES books nothing new", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const [driver] = await makeDrivers(1, "Twice Driver");
    await pauseOthers("Twice Driver");
    const sms = new RecordingSmsProvider();
    const { broadcast, inbound } = services(sms);
    const shift = await postShift(carrier.carrierId);
    await broadcast.broadcast(shift.id);

    const sid = seq();
    const message = { sid, from: driver!.phone, to: SENDER, body: `YES ${shift.code}` };
    const both = await Promise.all([inbound.handle(message), inbound.handle(message)]);
    expect(both.filter((reply) => reply.duplicate)).toHaveLength(1);
    expect(sms.sent.filter((text) => text.body.includes("Your shift is booked"))).toHaveLength(1);

    const again = await inbound.handle({ ...message, sid: seq() });
    expect(again.outcome).toBe("already_yours");
    expect(sms.sent.filter((text) => text.body.includes("Your shift is booked"))).toHaveLength(1);
  }, 60_000);

  it("one driver replies YES to two overlapping shifts at once: one books, the other is refused with the overlap text", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const [driver] = await makeDrivers(1, "Overlap Driver");
    await pauseOthers("Overlap Driver");
    const sms = new RecordingSmsProvider();
    const { broadcast, inbound } = services(sms);
    const first = await postShift(carrier.carrierId);
    const second = await postShift(carrier.carrierId);
    await broadcast.broadcast(first.id);
    await broadcast.broadcast(second.id);

    const replies = await Promise.all(
      [first, second].map((shift) => inbound.handle({ sid: seq(), from: driver!.phone, to: SENDER, body: `YES ${shift.code}` })),
    );
    expect(replies.map((reply) => reply.outcome).sort()).toEqual(["overlap", "won"]);
    expect(sms.sent.filter((text) => text.body === SMS_OVERLAP)).toHaveLength(1);
    expect(sms.sent.filter((text) => text.body.includes("Your shift is booked"))).toHaveLength(1);
    const { data } = await serviceClient().from("shifts").select("id").eq("booked_driver_id", driver!.driverId);
    expect(data).toHaveLength(1);
  }, 60_000);

  it("the fourth alert in 24 hours is skipped and on record", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    await makeDrivers(1, "Capped Driver");
    await pauseOthers("Capped Driver");
    const sms = new RecordingSmsProvider();
    const { broadcast } = services(sms);
    for (let n = 0; n < 3; n += 1) {
      const shift = await postShift(carrier.carrierId);
      expect(await broadcast.broadcast(shift.id)).toMatchObject({ sent: 1, skippedCap: 0 });
    }
    const fourth = await postShift(carrier.carrierId);
    expect(await broadcast.broadcast(fourth.id)).toMatchObject({ matched: 1, offered: 0, sent: 0, skippedCap: 1 });
    expect(sms.sent).toHaveLength(3);
    const { data } = await serviceClient().from("broadcast_recipients").select("status").eq("shift_id", fourth.id).single();
    expect(data?.status).toBe("skipped_cap");
  }, 60_000);

  it("a driver at the limit among others: the rest get the alert, and the shift still posts", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const drivers = await makeDrivers(3, "Mixed Driver");
    await pauseOthers("Mixed Driver");
    const sms = new RecordingSmsProvider();
    const { broadcast } = services(sms);
    const capped = drivers[0]!;
    const { error } = await serviceClient().rpc("test_log_insert", {
      p_table: "sms_messages",
      p_rows: [1, 2, 3].map(() => ({ direction: "outbound", kind: "offer", from_phone: "fake", to_phone: capped.phone, body: "FleetGrid: earlier", status: "sent", driver_id: capped.driverId })),
    });
    if (error) throw error;
    const shift = await postShift(carrier.carrierId);
    expect(await broadcast.broadcast(shift.id)).toMatchObject({ matched: 3, offered: 2, sent: 2, failed: 0, skippedCap: 1 });
    expect(sms.sent.map((text) => text.to)).not.toContain(capped.phone);
  }, 60_000);

  it("a broadcast cut off part way: the job finishes it, once each", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const drivers = await makeDrivers(4, "Resume Driver");
    await pauseOthers("Resume Driver");
    const sms = new RecordingSmsProvider();
    const { broadcast } = services(sms);
    const shift = await postShift(carrier.carrierId);
    const old = new Date(Date.now() - 5 * 60_000).toISOString();
    const { error } = await serviceClient()
      .from("broadcast_recipients")
      .insert(drivers.map((driver, index) => ({ shift_id: shift.id, driver_id: driver.driverId, round: 1, position: index + 1, code: shift.code, created_at: old })));
    if (error) throw error;
    // Noon Houston: stale_queued_recipients() reads the database clock, quiet hours this one.
    const now = new Date();
    const noon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18));
    const first = await broadcast.resumeQueued(noon);
    expect(first).toBe(4);
    expect(new Set(sms.sent.map((text) => text.to)).size).toBe(4);
    expect(await broadcast.resumeQueued(noon)).toBe(0);
    expect(sms.sent).toHaveLength(4);
  }, 60_000);

  it("two broadcasts of one shift at once send each driver one text", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const drivers = await makeDrivers(5, "Double Driver");
    await pauseOthers("Double Driver");
    const sms = new RecordingSmsProvider();
    const { broadcast } = services(sms);
    const shift = await postShift(carrier.carrierId);
    await Promise.all([broadcast.broadcast(shift.id), broadcast.broadcast(shift.id)]);
    const counts = drivers.map((driver) => sms.sent.filter((text) => text.to === driver.phone).length);
    expect(counts).toEqual([1, 1, 1, 1, 1]);
  }, 60_000);

  it("a failed send does not stop the rest, and the failure is on record", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    const drivers = await makeDrivers(4, "Failing Driver");
    await pauseOthers("Failing Driver");
    const sms = new RecordingSmsProvider();
    sms.failing.add(drivers[1]!.phone);
    const { broadcast } = services(sms);
    const shift = await postShift(carrier.carrierId);
    expect(await broadcast.broadcast(shift.id)).toMatchObject({ offered: 4, sent: 3, failed: 1 });
    const { data } = await serviceClient().from("broadcast_recipients").select("status, error_code").eq("driver_id", drivers[1]!.driverId).single();
    expect(data).toEqual({ status: "failed", error_code: "30003" });
  }, 60_000);

  it("texts held in production go out once a sender is set: once only, never to a STOP, never an alert", async () => {
    const [wants, stopped] = await makeDrivers(2, "Held Driver");
    const admin = serviceClient();
    const logs = () => new SmsLogRepository(admin);
    const holding = new TextService(new HeldSmsProvider(), logs);
    expect((await holding.send({ ...wants!, smsOptedOut: false }, "welcome", "FleetGrid: held welcome")).status).toBe("held");
    await holding.send({ ...stopped!, smsOptedOut: false }, "welcome", "FleetGrid: held welcome");
    await holding.send({ ...wants!, smsOptedOut: false }, "offer", "FleetGrid: held alert");
    await admin.from("drivers").update({ sms_opted_out: true, sms_opted_out_at: new Date().toISOString() }).eq("id", stopped!.driverId);

    const sms = new RecordingSmsProvider();
    const texting = new TextService(sms, logs);
    const drivers = new TextingDriverRepository(admin);
    const daytime = new Date(Date.UTC(2026, 10, 5, 17));
    const runs = await Promise.all([texting.drainHeld(drivers, daytime), texting.drainHeld(drivers, daytime)]);

    expect(runs[0]! + runs[1]!).toBe(1);
    expect(sms.sent).toEqual([{ to: wants!.phone, body: "FleetGrid: held welcome" }]);
    const statusOf = async (driverId: string, kind: string) =>
      (await admin.from("sms_messages_current").select("status").eq("driver_id", driverId).eq("kind", kind).single()).data?.status;
    expect(await statusOf(wants!.driverId, "welcome")).toBe("queued");
    expect(await statusOf(stopped!.driverId, "welcome")).toBe("skipped_opted_out");
    expect(await statusOf(wants!.driverId, "offer")).toBe("held");
    await admin.rpc("test_log_delete", { p_table: "sms_messages", p_column: "to_phone", p_values: [wants!.phone, stopped!.phone] });
  }, 60_000);

  it("210 drivers: 200 texted once each, in about the time Vercel allows", async () => {
    const carrier = await createTestCarrier({ subscription: "active" });
    await makeDrivers(210, "Scale Driver");
    await pauseOthers("Scale Driver");
    const sms = new RecordingSmsProvider();
    // Twilio answers a send in about a quarter of a second.
    const send = sms.send.bind(sms);
    sms.send = async (message) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      return send(message);
    };
    const { broadcast } = services(sms);
    const shift = await postShift(carrier.carrierId);

    const started = Date.now();
    const result = await broadcast.broadcast(shift.id);
    const seconds = (Date.now() - started) / 1000;
    console.log(`[broadcast timing] ${result.sent} texts in ${seconds.toFixed(1)}s`);

    expect(result).toMatchObject({ matched: 210, offered: 200, sent: 200, failed: 0 });
    expect(new Set(sms.sent.map((text) => text.to)).size).toBe(200);
    expect(seconds).toBeLessThan(60);
  }, 420_000);
});
