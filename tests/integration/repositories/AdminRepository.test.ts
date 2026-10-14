import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { AdminRepository } from "@/server/repositories/AdminRepository";
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

  it("lists cards with their profiles, newest first, filtered by status", async () => {
    const repository = new AdminRepository(admin.client);
    const all = await repository.listDrivers({});
    const mine = all.filter((row) => [pendingDriver.driverId, approvedDriver.driverId].includes(row.driver.id));
    expect(mine.map((row) => row.profile.status).sort()).toEqual(["approved", "pending"]);
    expect(mine.find((row) => row.driver.id === pendingDriver.driverId)).toMatchObject({
      driver: { fullName: "Pending Repo Driver" },
      profile: { id: pendingDriver.id, phone: pendingDriver.phone, role: "driver" },
    });
    for (let index = 1; index < all.length; index += 1) {
      expect(all[index - 1].driver.createdAt >= all[index].driver.createdAt).toBe(true);
    }

    const pending = await repository.listDrivers({ status: "pending" });
    expect(pending.map((row) => row.driver.id)).toContain(pendingDriver.driverId);
    expect(pending.map((row) => row.driver.id)).not.toContain(approvedDriver.driverId);
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
    expect(await asDriver.listDrivers({})).toHaveLength(1);
  });
});
