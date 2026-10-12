// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { AdminService } from "@/server/services/AdminService";
import { FakeAdminRepository } from "../../fakes/FakeAdminRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeServiceAreaRepository } from "../../fakes/FakeServiceAreaRepository";
import {
  buildDriver,
  buildProfile,
  CARRIER_USER_ID,
  OTHER_USER_ID,
  PLACES,
  USER_ID,
} from "../../setup/factories";

const ADMIN_ID = "33333333-3333-4333-8333-333333333333";

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("AdminService", () => {
  let admin: FakeAdminRepository;
  let profiles: FakeProfileRepository;
  let service: AdminService;

  const pending = buildProfile({ id: USER_ID, status: "pending" });
  const approved = buildProfile({ id: OTHER_USER_ID, phone: "+15555550108", status: "approved" });

  beforeEach(() => {
    profiles = new FakeProfileRepository([
      buildProfile({ id: ADMIN_ID, role: "admin", phone: "+15555550102", status: "approved" }),
      buildProfile({ id: CARRIER_USER_ID, role: "carrier", phone: "+15555550101" }),
      pending,
      approved,
    ]);
    admin = new FakeAdminRepository(
      [
        {
          driver: buildDriver({
            id: "d1",
            profileId: USER_ID,
            city: PLACES.houston.city,
            zip: PLACES.houston.zip,
            lat: PLACES.houston.lat,
            lng: PLACES.houston.lng,
            createdAt: "2026-10-02T00:00:00.000Z",
          }),
          profile: pending,
        },
        {
          driver: buildDriver({
            id: "d2",
            profileId: OTHER_USER_ID,
            fullName: "Dallas Driver",
            lat: PLACES.dallas.lat,
            lng: PLACES.dallas.lng,
            createdAt: "2026-10-03T00:00:00.000Z",
          }),
          profile: approved,
        },
      ],
      profiles,
    );
    service = new AdminService(admin, profiles, new FakeServiceAreaRepository((lat) => lat < 31));
  });

  it("is for admins only", async () => {
    for (const who of [USER_ID, CARRIER_USER_ID, "nobody"]) {
      expect((await expectAppError(service.listDrivers(who, {}))).code).toBe("FORBIDDEN");
      expect(
        (
          await expectAppError(
            service.setDriverStatus(who, { profileId: USER_ID, status: "approved" }),
          )
        ).code,
      ).toBe("FORBIDDEN");
    }
    expect(admin.statusChanges).toEqual([]);
  });

  it("lists every driver newest first with the launch-area answer, or one status", async () => {
    const all = await service.listDrivers(ADMIN_ID, {});
    expect(all.map((row) => [row.driver.fullName, row.profile.status, row.inServiceArea])).toEqual([
      ["Dallas Driver", "approved", false],
      ["Pat Driver", "pending", true],
    ]);
    const queue = await service.listDrivers(ADMIN_ID, { status: "pending" });
    expect(queue.map((row) => row.driver.id)).toEqual(["d1"]);
    expect((await service.listDrivers(ADMIN_ID, { status: "all" })).length).toBe(2);
    expect((await service.listDrivers(ADMIN_ID, { status: "blocked" })).length).toBe(0);
  });

  it("leaves the area unknown for a card without coordinates", async () => {
    admin.rows[0].driver = buildDriver({ id: "d1", profileId: USER_ID, lat: null, lng: null });
    const [, withoutCoordinates] = await service.listDrivers(ADMIN_ID, {});
    expect(withoutCoordinates.inServiceArea).toBeNull();
  });

  it("approves, blocks and reopens a driver, and does nothing when the status is already so", async () => {
    const approvedNow = await service.setDriverStatus(ADMIN_ID, {
      profileId: USER_ID,
      status: "approved",
    });
    expect(approvedNow.status).toBe("approved");
    await service.setDriverStatus(ADMIN_ID, { profileId: USER_ID, status: "blocked" });
    await service.setDriverStatus(ADMIN_ID, { profileId: USER_ID, status: "pending" });
    expect(admin.statusChanges.map((change) => change.status)).toEqual([
      "approved",
      "blocked",
      "pending",
    ]);

    const same = await service.setDriverStatus(ADMIN_ID, {
      profileId: OTHER_USER_ID,
      status: "approved",
    });
    expect(same.status).toBe("approved");
    expect(admin.statusChanges).toHaveLength(3);
  });

  it("refuses an unknown driver, a non-driver and a bad status", async () => {
    expect(
      (
        await expectAppError(
          service.setDriverStatus(ADMIN_ID, { profileId: CARRIER_USER_ID, status: "approved" }),
        )
      ).code,
    ).toBe("NOT_FOUND");
    expect(
      (
        await expectAppError(
          service.setDriverStatus(ADMIN_ID, {
            profileId: "99999999-9999-4999-8999-999999999999",
            status: "approved",
          }),
        )
      ).code,
    ).toBe("NOT_FOUND");
    const bad = await expectAppError(
      service.setDriverStatus(ADMIN_ID, { profileId: USER_ID, status: "gone" }),
    );
    expect(bad.fieldErrors).toHaveProperty("status");
    const noId = await expectAppError(
      service.setDriverStatus(ADMIN_ID, { profileId: "x", status: "approved" }),
    );
    expect(noId.fieldErrors).toEqual({ profileId: "Driver not found" });
  });
});
