// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { alertAllowed, shiftAlertAllowlist } from "@/lib/shifts/alertAllowlist";
import { BroadcastService } from "@/server/services/BroadcastService";
import { TextService } from "@/server/services/TextService";
import {
  buildShift,
  buildTextingDriver,
  FakeShiftWorld,
  FakeSmsLog,
  RecordingSmsProvider,
} from "../../fakes/FakeShiftRepositories";

/** SHIFT_ALERTS_ONLY_TO: during a live test with real phones, no real driver gets a shift alert. */
describe("the shift alert allowlist", () => {
  describe("reading the setting", () => {
    it("unset holds nobody back", () => {
      expect(shiftAlertAllowlist(undefined)).toBeNull();
      expect(alertAllowed(null, "+17135550100")).toBe(true);
    });

    it("reads numbers in any US format, and drops what is not a number", () => {
      expect([...shiftAlertAllowlist(" +1 (308) 295-5177 ,3606601159, nonsense")!]).toEqual(["+13082955177", "+13606601159"]);
    });

    it("set but with no valid number, nobody gets an alert", () => {
      for (const value of ["", "none", " , "]) {
        const allowlist = shiftAlertAllowlist(value);
        expect(allowlist?.size).toBe(0);
        expect(alertAllowed(allowlist, "+13082955177")).toBe(false);
      }
    });
  });

  describe("broadcasting with it set", () => {
    let world: FakeShiftWorld;
    let sms: RecordingSmsProvider;
    let smsLog: FakeSmsLog;
    const drivers = [1, 2, 3, 4].map((n) => buildTextingDriver(n));
    const shift = buildShift();
    const testPhone = drivers[2]!.phone;

    const service = (setting: string | undefined) => {
      const allowlist = () => shiftAlertAllowlist(setting);
      const texts = new TextService(sms, () => smsLog, undefined, undefined, allowlist);
      return { texts, broadcasts: new BroadcastService(world.shiftRepository, world.broadcastRepository, texts, () => 0.5, undefined, allowlist) };
    };

    beforeEach(() => {
      world = new FakeShiftWorld();
      for (const driver of drivers) world.addDriver(driver);
      world.matching = drivers.map((driver) => driver.driverId);
      world.shifts.set(shift.id, shift);
      sms = new RecordingSmsProvider();
      smsLog = new FakeSmsLog();
    });

    it("only the listed number is offered the shift and texted; the count shows only it", async () => {
      const { broadcasts } = service(testPhone);
      expect(await broadcasts.countMatches(shift, shift)).toBe(1);
      expect(await broadcasts.broadcast(shift.id, world.now())).toMatchObject({ matched: 1, offered: 1, sent: 1 });
      expect(sms.sent.map((text) => text.to)).toEqual([testPhone]);
      // No offer for anyone else, so nobody else can book it.
      expect(world.recipients.map((row) => row.driverId)).toEqual([drivers[2]!.driverId]);
    });

    it("set but empty, nothing goes and nobody is offered", async () => {
      const { broadcasts } = service("none");
      expect(await broadcasts.broadcast(shift.id, world.now())).toMatchObject({ matched: 0, offered: 0, sent: 0 });
      expect(sms.sent).toEqual([]);
      expect(world.recipients).toEqual([]);
    });

    it("unset, every match is texted as before", async () => {
      const { broadcasts } = service(undefined);
      expect((await broadcasts.broadcast(shift.id, world.now())).sent).toBe(4);
    });

    it("the sending path refuses an alert to any other number, whoever asks, and logs nothing", async () => {
      const { texts } = service(testPhone);
      const refused = await texts.send({ ...drivers[0]!, smsOptedOut: false }, "offer", "FleetGrid: an alert");
      expect(refused).toMatchObject({ sent: false, status: "skipped_test_mode", messageId: null });
      expect(sms.sent).toEqual([]);
      expect(smsLog.outbound()).toEqual([]);
    });

    it("account texts are not held back", async () => {
      const { texts } = service(testPhone);
      expect((await texts.send({ ...drivers[0]!, smsOptedOut: false }, "welcome", "FleetGrid: welcome")).sent).toBe(true);
    });

    it("the resume job leaves a queued alert to anyone else alone", async () => {
      const { broadcasts } = service(testPhone);
      world.recipients.push(
        ...drivers.map((driver, index) => ({
          id: `r${index}`,
          shiftId: shift.id,
          driverId: driver.driverId,
          round: 1,
          position: index + 1,
          code: shift.shortCode,
          status: "queued" as const,
          messageSid: null,
          errorCode: null,
          sentAt: null,
          deliveredAt: null,
          repliedAt: null,
          createdAt: new Date(world.now().getTime() - 10 * 60_000).toISOString(),
        })),
      );
      // Noon in Houston: outside quiet hours, so only the allowlist holds anything back.
      await broadcasts.resumeQueued(new Date("2026-11-01T18:00:00.000Z"));
      expect(sms.sent.map((text) => text.to)).toEqual([testPhone]);
    });
  });
});
