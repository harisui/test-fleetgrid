import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { AdminRepository } from "@/server/repositories/AdminRepository";
import { ServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import {
  cleanupTestUsers,
  createListedDriver,
  createTestDriver,
  createTestUser,
  type TestDriver,
  type TestUser,
} from "../../setup/supabase";

describe("AdminRepository", () => {
  let admin: TestUser;
  let pendingDriver: TestDriver;
  let approvedDriver: TestDriver;

  beforeAll(async () => {
    [admin, pendingDriver, approvedDriver] = await Promise.all([
      createTestUser({ role: "admin", status: "approved" }),
      createTestDriver({ fullName: "Pending Repo Driver" }),
      createListedDriver({ fullName: "Approved Repo Driver" }),
    ]);
  });

  afterAll(cleanupTestUsers);

  it("lists every card with its profile, newest first, and finds one by id", async () => {
    const repository = new AdminRepository(admin.client);
    const all = await repository.listDrivers();
    const mine = all.filter((row) => [pendingDriver.driverId, approvedDriver.driverId].includes(row.driver.id));
    expect(mine.map((row) => row.profile.status).sort()).toEqual(["approved", "pending"]);
    expect(mine.find((row) => row.driver.id === pendingDriver.driverId)).toMatchObject({
      driver: { fullName: "Pending Repo Driver" },
      profile: { id: pendingDriver.id, phone: pendingDriver.phone, role: "driver" },
    });
    for (let index = 1; index < all.length; index += 1) {
      expect(all[index - 1].driver.createdAt >= all[index].driver.createdAt).toBe(true);
    }

    const one = await repository.findDriver(pendingDriver.driverId);
    expect(one?.profile.id).toBe(pendingDriver.id);
    expect(await repository.findDriver("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("changes a profile's status as an admin, and a driver cannot", async () => {
    const repository = new AdminRepository(admin.client);
    const approved = await repository.setProfileStatus(pendingDriver.id, "approved");
    expect(approved.status).toBe("approved");
    const blocked = await repository.setProfileStatus(pendingDriver.id, "blocked");
    expect(blocked.status).toBe("blocked");
    await repository.setProfileStatus(pendingDriver.id, "pending");

    const asDriver = new AdminRepository(approvedDriver.client);
    const refused = await asDriver.setProfileStatus(approvedDriver.id, "blocked").catch((error) => error);
    expect(refused).toBeInstanceOf(AppError);
    expect((refused as AppError).code).toBe("FORBIDDEN");
    expect(await asDriver.listDrivers()).toHaveLength(1);
  });

  it("writes the audit log in the admin's name and reads a record's history newest first; a driver sees none", async () => {
    const repository = new AdminRepository(admin.client);
    const first = await repository.writeAudit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: "driver_approved",
      targetType: "driver",
      targetId: pendingDriver.driverId,
      detail: { from: "pending", to: "approved" },
    });
    expect(first).toMatchObject({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: "driver_approved",
      targetType: "driver",
      targetId: pendingDriver.driverId,
      detail: { from: "pending", to: "approved" },
    });
    const second = await repository.writeAudit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: "driver_blocked",
      targetType: "driver",
      targetId: pendingDriver.driverId,
    });
    expect(second.detail).toEqual({});

    const history = await repository.listAudit("driver", pendingDriver.driverId);
    expect(history.map((entry) => entry.action)).toEqual(["driver_blocked", "driver_approved"]);
    expect(await repository.listAudit("driver", approvedDriver.driverId)).toEqual([]);

    // Not in another admin's name, and not as a driver at all.
    const forged = await repository
      .writeAudit({ adminId: pendingDriver.id, adminPhone: pendingDriver.phone, action: "driver_approved", targetType: "driver", targetId: pendingDriver.driverId })
      .catch((error) => error);
    expect((forged as AppError).code).toBe("FORBIDDEN");
    const asDriver = new AdminRepository(approvedDriver.client);
    expect(await asDriver.listAudit("driver", pendingDriver.driverId)).toEqual([]);
    const refused = await asDriver
      .writeAudit({ adminId: approvedDriver.id, adminPhone: approvedDriver.phone, action: "driver_approved", targetType: "driver", targetId: approvedDriver.driverId })
      .catch((error) => error);
    expect((refused as AppError).code).toBe("FORBIDDEN");
  });

  it("lets an admin, and only an admin, list the active service areas", async () => {
    const areas = await new ServiceAreaRepository(admin.client).listActive();
    expect(areas.map((area) => area.name)).toEqual(expect.arrayContaining(["Houston, TX", "Pasadena, TX"]));
    expect(areas.every((area) => area.isActive && area.radiusMiles >= 5)).toBe(true);
    expect(await new ServiceAreaRepository(approvedDriver.client).listActive()).toEqual([]);
  });
});
