import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CURRENT_TERMS } from "@/content/legal/terms";
import { TermsAdminRepository } from "@/server/repositories/TermsRepository";
import { TosRepository } from "@/server/repositories/TosRepository";
import { cleanupTestUsers, createTestDriver, createTestUser, serviceClient, type TestDriver, type TestUser } from "../../setup/supabase";

/** A driver's Terms acceptances, for the admin's driver panel (Milestone 6). */
describe("TosRepository.listByProfile", () => {
  let driver: TestDriver;
  let other: TestDriver;
  let admin: TestUser;

  beforeAll(async () => {
    [driver, other, admin] = await Promise.all([
      createTestDriver(),
      createTestDriver(),
      createTestUser({ role: "admin", status: "approved" }),
    ]);
    await new TermsAdminRepository(serviceClient()).publish(CURRENT_TERMS);
    await new TosRepository(driver.client).record({
      profileId: driver.id,
      version: CURRENT_TERMS.version,
      ip: "203.0.113.4",
      userAgent: "Phone",
      method: "signup",
      statement: "I have read and agree",
    });
  });

  afterAll(cleanupTestUsers);

  it("gives an admin every acceptance of the driver, with how it was given", async () => {
    const rows = await new TosRepository(admin.client).listByProfile(driver.id);
    expect(rows).toEqual([
      expect.objectContaining({ profileId: driver.id, version: CURRENT_TERMS.version, method: "signup", statement: "I have read and agree" }),
    ]);
  });

  it("gives another driver nothing of it", async () => {
    expect(await new TosRepository(other.client).listByProfile(driver.id)).toEqual([]);
  });
});
