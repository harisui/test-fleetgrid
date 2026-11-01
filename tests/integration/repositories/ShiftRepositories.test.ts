import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BroadcastRepository } from "@/server/repositories/BroadcastRepository";
import { ShiftRepository } from "@/server/repositories/ShiftRepository";
import { SmsLogRepository } from "@/server/repositories/SmsLogRepository";
import { TextingDriverRepository } from "@/server/repositories/TextingDriverRepository";
import type { Shift } from "@/types/domain";
import {
  cleanupTestUsers,
  createListedDriver,
  createTestCarrier,
  serviceClient,
  TEST_PLACES,
  type TestCarrier,
  type TestDriver,
} from "../../setup/supabase";

const HOUR = 60 * 60 * 1000;

function shiftInput(startsInHours = 24) {
  const start = new Date(Date.now() + startsInHours * HOUR);
  return {
    ...TEST_PLACES.pasadena,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 8 * HOUR).toISOString(),
    cdlClass: "A" as const,
    endorsements: [],
    minYears: 0,
    equipmentTypes: [],
    twicRequired: false,
    medicalRequired: false,
    manualRequired: false,
    payText: "$32 an hour",
    workDescription: "Container moves between the port and the yard.",
    onsiteContactName: "Lee Yard",
    onsiteContactPhone: "+17135550100",
    sendAfter: null,
  };
}

/**
 * Broadcast Shift through the real database (0023): posting through RLS, the 20-way race
 * for one shift, release, the booked contact, and the driver lookups by phone.
 */
describe("shift repositories", () => {
  let carrier: TestCarrier;
  let drivers: TestDriver[];
  let shift: Shift;
  const admin = () => serviceClient();

  beforeAll(async () => {
    carrier = await createTestCarrier({ subscription: "active" });
    drivers = await Promise.all(
      Array.from({ length: 20 }, (_, index) => createListedDriver({ fullName: `Racer ${index + 1}`, place: TEST_PLACES.pasadena })),
    );
    shift = await new ShiftRepository(carrier.client).create(carrier.carrierId, shiftInput());
    const recipients = new BroadcastRepository(admin());
    await new ShiftRepository(admin()).update(shift.id, { broadcastRound: 1, broadcastAt: new Date().toISOString() });
    await recipients.insertMany(
      drivers.map((driver, index) => ({
        shiftId: shift.id,
        driverId: driver.driverId,
        round: 1,
        position: index + 1,
        code: shift.shortCode,
      })),
    );
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  it("a subscribed carrier posts through RLS and the database draws a four-digit code", async () => {
    expect(shift.shortCode).toMatch(/^\d{4}$/);
    expect(shift).toMatchObject({ status: "open", city: "Pasadena", payText: "$32 an hour" });
    expect(await new ShiftRepository(carrier.client).list({ carrierId: carrier.carrierId })).toHaveLength(1);
  });

  it("matching finds the listed drivers near the shift", async () => {
    const matches = await new ShiftRepository(admin()).matchingDrivers(TEST_PLACES.pasadena, shiftInput());
    const ids = new Set(matches.map((match) => match.driverId));
    for (const driver of drivers) expect(ids.has(driver.driverId)).toBe(true);
    expect(matches.find((match) => match.driverId === drivers[0].driverId)?.phone).toBe(drivers[0].phone);
  });

  it("each driver's bare YES finds their one open offer", async () => {
    const offers = await new BroadcastRepository(admin()).openOffersForDriver(drivers[0].driverId);
    expect(offers).toEqual([{ shiftId: shift.id, code: shift.shortCode }]);
  });

  it("20 drivers reply YES at once: exactly one wins, the rest find it filled", async () => {
    const outcomes = await Promise.all(
      drivers.map((driver) => new ShiftRepository(admin()).claim(driver.driverId, shift.shortCode)),
    );
    const won = outcomes.filter((result) => result.outcome === "won");
    expect(won).toHaveLength(1);
    expect(outcomes.filter((result) => result.outcome === "filled")).toHaveLength(19);

    const booked = await new ShiftRepository(admin()).findById(shift.id);
    const winner = drivers.find((driver) => driver.driverId === booked?.bookedDriverId);
    expect(booked?.status).toBe("booked");
    expect(winner).toBeDefined();

    const statuses = (await new BroadcastRepository(admin()).listByShift(shift.id)).map((r) => r.status);
    expect(statuses.filter((status) => status === "booked")).toHaveLength(1);
    expect(statuses.filter((status) => status === "too_late")).toHaveLength(19);

    // The shift's carrier reads the winner's name and phone; nothing else names them.
    const contact = await new ShiftRepository(carrier.client).bookedDriverContact(shift.id);
    expect(contact).toMatchObject({ driverId: winner!.driverId, phone: winner!.phone });
    const { data: profiles } = await carrier.client.from("profiles").select("phone").eq("id", winner!.id);
    expect(profiles).toEqual([]);
  });

  it("release counts the no-show, reopens with a fresh code and the old code no longer books", async () => {
    const before = await new ShiftRepository(admin()).findById(shift.id);
    const released = await new ShiftRepository(admin()).release(shift.id);
    expect(released).toBe(before?.bookedDriverId);
    const after = await new ShiftRepository(admin()).findById(shift.id);
    expect(after).toMatchObject({ status: "open", bookedDriverId: null });
    expect(after?.releasedAt).not.toBeNull();
    expect(after?.shortCode).not.toBe(before?.shortCode);
    expect(await new BroadcastRepository(admin()).noShowDriverIds(shift.id)).toEqual([released]);
    const { data } = await admin().from("drivers").select("no_show_count").eq("id", released!).single();
    expect(data?.no_show_count).toBe(1);
    const late = drivers.find((driver) => driver.driverId !== released)!;
    expect((await new ShiftRepository(admin()).claim(late.driverId, before!.shortCode)).outcome).toBe("filled");
  });

  it("finds a driver by phone and syncs STOP", async () => {
    const texting = new TextingDriverRepository(admin());
    const found = await texting.findByPhone(drivers[3].phone);
    expect(found).toMatchObject({ driverId: drivers[3].driverId, fullName: "Racer 4", smsOptedOut: false, status: "approved" });
    await texting.setOptedOut(drivers[3].driverId, true, new Date().toISOString());
    expect((await texting.findById(drivers[3].driverId))?.smsOptedOut).toBe(true);
    expect(await texting.findByPhone("+15555550000")).toBeNull();
  });

  it("the text log keeps each provider id once", async () => {
    const log = new SmsLogRepository(admin());
    const entry = {
      direction: "inbound" as const,
      kind: "inbound",
      fromPhone: drivers[0].phone,
      toPhone: "+18888692040",
      body: "YES",
      providerSid: `SMtest${shift.id.slice(0, 8)}`,
      status: "received",
      shiftId: shift.id,
    };
    expect(await log.record(entry)).toBe(true);
    expect(await log.record(entry)).toBe(false);
    expect((await log.listByShift(shift.id)).map((m) => m.providerSid)).toContain(entry.providerSid);
  });

  it("a carrier cannot post a shift outside the areas", async () => {
    await expect(
      new ShiftRepository(carrier.client).create(carrier.carrierId, { ...shiftInput(), ...TEST_PLACES.dallas }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
