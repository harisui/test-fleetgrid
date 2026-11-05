// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { cancelledText, offerText } from "@/lib/shifts/texts";
import { BroadcastService } from "@/server/services/BroadcastService";
import type { CarrierAccess, CarrierStage } from "@/server/services/CarrierService";
import { SHIFT_OUTSIDE_AREA_MESSAGE, ShiftService } from "@/server/services/ShiftService";
import { TextService } from "@/server/services/TextService";
import { buildCarrier, USER_ID } from "../../setup/factories";
import { FakeServiceAreaRepository } from "../../fakes/FakeServiceAreaRepository";
import { buildShift, buildTextingDriver, FakeShiftWorld, FakeSmsLog, RecordingSmsProvider } from "../../fakes/FakeShiftRepositories";
import { FakeZipProvider } from "../../fakes/FakeZipProvider";

const CARRIER = buildCarrier({ id: "c0000000-0000-4000-a000-000000000001" });

const FORM = {
  zip: "77506",
  date: "2026-11-05",
  startTime: "06:00",
  endTime: "14:00",
  cdlClass: "A",
  endorsements: [],
  minYears: "0",
  equipmentTypes: [],
  workDescription: "Port moves between Barbours Cut and the yard.",
  onsiteContactName: "Lee Yard",
  onsiteContactPhone: "713 555 0100",
};

describe("ShiftService", () => {
  let carriersOff = false;
  let world: FakeShiftWorld;
  let sms: RecordingSmsProvider;
  let stage: CarrierStage;
  let now: Date;
  let service: ShiftService;
  const drivers = [1, 2, 3].map((n) => buildTextingDriver(n));

  beforeEach(() => {
    carriersOff = false;
    world = new FakeShiftWorld();
    for (const driver of drivers) world.addDriver(driver);
    world.matching = drivers.map((d) => d.driverId);
    sms = new RecordingSmsProvider();
    stage = "ready";
    now = new Date("2026-11-01T17:00:00.000Z"); // noon in Houston
    world.now = () => now;
    const smsLog = new FakeSmsLog();
    const texts = new TextService(sms, () => smsLog);
    const broadcasts = new BroadcastService(world.shiftRepository, world.broadcastRepository, texts, () => 0.3);
    const access = async (): Promise<CarrierAccess> => ({
      carrier: CARRIER,
      termsAccepted: true,
      subscription: null,
      subscribed: stage === "ready",
      waitlisted: false,
      stage,
    });
    service = new ShiftService(
      { getAccess: access },
      world.shiftRepository,
      world.broadcastRepository,
      {
        shifts: () => world.shiftRepository,
        recipients: () => world.broadcastRepository,
        drivers: () => world.textingDrivers,
      },
      new FakeZipProvider([
        { zip: "77506", city: "Pasadena", state: "TX", lat: 29.7009, lng: -95.1989 },
        { zip: "75201", city: "Dallas", state: "TX", lat: 32.7904, lng: -96.8044 },
      ]),
      new FakeServiceAreaRepository((lat) => lat < 31),
      () => broadcasts,
      texts,
      () => now,
      () => carriersOff,
    );
  });

  it("with CARRIER_DISABLED on, nobody posts or releases, even by calling the action directly", async () => {
    const { shift } = await service.postShift(USER_ID, FORM);
    const textsBefore = sms.sent.length;
    carriersOff = true;
    await expect(service.postShift(USER_ID, FORM)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.releaseShift(USER_ID, { shiftId: shift.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(sms.sent).toHaveLength(textsBefore);
  });

  it("posts a shift and texts the matches at once during the day", async () => {
    const { shift, broadcast } = await service.postShift(USER_ID, FORM);
    expect(shift).toMatchObject({ city: "Pasadena", onsiteContactPhone: "+17135550100", sendAfter: null, broadcastRound: 1 });
    expect(broadcast).toMatchObject({ sent: 3 });
    expect(sms.sent[0].body).toBe(offerText(shift, shift.shortCode));
  });

  it("holds a late-night post until 7:00 AM Houston time", async () => {
    now = new Date("2026-11-02T04:00:00.000Z"); // 10 PM in Houston
    const { shift, broadcast } = await service.postShift(USER_ID, FORM);
    expect(broadcast).toBeNull();
    expect(shift.sendAfter).toBe("2026-11-02T13:00:00.000Z"); // 7 AM CST
    expect(sms.sent).toHaveLength(0);
  });

  it("sends a late-night post at once when the shift starts within 12 hours", async () => {
    now = new Date("2026-11-05T04:00:00.000Z"); // 10 PM the night before a 6 AM shift
    const { broadcast } = await service.postShift(USER_ID, FORM);
    expect(broadcast).toMatchObject({ sent: 3 });
  });

  it("refuses a ZIP outside the areas, a start in the past and a carrier without access", async () => {
    await expect(service.postShift(USER_ID, { ...FORM, zip: "75201" })).rejects.toMatchObject({
      fieldErrors: { zip: SHIFT_OUTSIDE_AREA_MESSAGE },
    });
    await expect(service.postShift(USER_ID, { ...FORM, date: "2026-10-30" })).rejects.toMatchObject({ code: "VALIDATION" });
    stage = "billing";
    await expect(service.postShift(USER_ID, FORM)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.listCarrierShifts(USER_ID)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("counts the matches for the live count, zero outside the areas", async () => {
    expect(await service.countMatches(USER_ID, { ...buildShift(), zip: "77506" })).toBe(3);
    expect(await service.countMatches(USER_ID, { ...buildShift(), zip: "75201" })).toBe(0);
  });

  it("shows another carrier's shift as not found", async () => {
    const other = buildShift({ carrierId: "c0000000-0000-4000-a000-000000000099" });
    world.shifts.set(other.id, other);
    await expect(service.getCarrierShift(USER_ID, { shiftId: other.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reveals the booked driver's name and phone on the shift page only after a booking", async () => {
    const { shift } = await service.postShift(USER_ID, FORM);
    expect((await service.getCarrierShift(USER_ID, { shiftId: shift.id })).bookedDriver).toBeNull();
    await world.shiftRepository.claim(drivers[1].driverId, shift.shortCode);
    const detail = await service.getCarrierShift(USER_ID, { shiftId: shift.id });
    expect(detail.bookedDriver).toEqual({ driverId: drivers[1].driverId, fullName: "Driver 2", phone: drivers[1].phone });
  });

  it("lists a carrier's shifts, and a driver's booked ones split into upcoming and past", async () => {
    const { shift } = await service.postShift(USER_ID, FORM);
    expect((await service.listCarrierShifts(USER_ID)).map((item) => item.id)).toEqual([shift.id]);
    await world.shiftRepository.claim(drivers[0].driverId, shift.shortCode);
    const before = await service.listDriverShifts(drivers[0].driverId);
    expect(before.upcoming.map((item) => item.id)).toEqual([shift.id]);
    expect(before.past).toEqual([]);
    now = new Date(new Date(shift.endsAt).getTime() + 1000);
    const after = await service.listDriverShifts(drivers[0].driverId);
    expect(after.upcoming).toEqual([]);
    expect(after.past.map((item) => item.id)).toEqual([shift.id]);
    expect(service.statusOf({ ...shift, status: "open" })).toBe("expired");
  });

  it("cancelling a booked shift texts the driver the approved notice", async () => {
    const { shift } = await service.postShift(USER_ID, FORM);
    await world.shiftRepository.claim(drivers[0].driverId, shift.shortCode);
    sms.sent = [];
    const cancelled = await service.cancelShift(USER_ID, { shiftId: shift.id, reason: "Load moved" });
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Load moved" });
    expect(sms.sent).toEqual([{ to: drivers[0].phone, body: cancelledText(shift) }]);
    await expect(service.cancelShift(USER_ID, { shiftId: shift.id })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("cancelling an open shift texts nobody", async () => {
    const { shift } = await service.postShift(USER_ID, FORM);
    sms.sent = [];
    await service.cancelShift(USER_ID, { shiftId: shift.id });
    expect(sms.sent).toHaveLength(0);
  });

  it("releasing a no-show counts it and broadcasts again without them, with a fresh code", async () => {
    const { shift } = await service.postShift(USER_ID, FORM);
    await world.shiftRepository.claim(drivers[0].driverId, shift.shortCode);
    sms.sent = [];
    const { shift: reopened, broadcast } = await service.releaseShift(USER_ID, { shiftId: shift.id });
    expect(reopened).toMatchObject({ status: "open", broadcastRound: 2 });
    expect(reopened.shortCode).not.toBe(shift.shortCode);
    expect(broadcast).toMatchObject({ round: 2, sent: 2 });
    expect(sms.sent.map((m) => m.to)).not.toContain(drivers[0].phone);
    expect(world.drivers.get(drivers[0].driverId)?.noShowCount).toBe(1);
    await expect(service.releaseShift(USER_ID, { shiftId: shift.id })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
