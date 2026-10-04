import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { ServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import {
  anonClient,
  cleanupTestUsers,
  createTestUser,
  serviceClient,
  type TestUser,
} from "../../setup/supabase";

/** ZIP centres from src/data/us-zips.tsv. */
const HOUSTON = { lat: 29.7594, lng: -95.3594 };
const BAYTOWN = { lat: 29.7461, lng: -94.9653 }; // about 24 miles from Houston
const DALLAS = { lat: 32.7904, lng: -96.8044 }; // about 226 miles from Houston
const AUSTIN = { lat: 30.2713, lng: -97.7426 };

describe("ServiceAreaRepository and service_areas access (local Supabase)", () => {
  let driver: TestUser;
  let repository: ServiceAreaRepository;

  beforeAll(async () => {
    driver = await createTestUser({ role: "driver" });
    repository = new ServiceAreaRepository(driver.client);
  });

  afterAll(async () => {
    await cleanupTestUsers();
  });

  /** Every test leaves the two launch areas as the migration seeded them. */
  afterEach(async () => {
    const { error } = await serviceClient()
      .from("service_areas")
      .update({ is_active: true, radius_miles: 50 })
      .in("name", ["Houston, TX", "Pasadena, TX"]);
    if (error) throw new Error(`restore failed: ${error.message}`);
  });

  it("tells a signed-in driver whether a point is inside an active area", async () => {
    expect(await repository.contains(HOUSTON.lat, HOUSTON.lng)).toBe(true);
    expect(await repository.contains(BAYTOWN.lat, BAYTOWN.lng)).toBe(true);
    expect(await repository.contains(DALLAS.lat, DALLAS.lng)).toBe(false);
    expect(await repository.contains(AUSTIN.lat, AUSTIN.lng)).toBe(false);
  });

  it("recomputes at once when an area is deactivated or resized", async () => {
    const admin = serviceClient();
    await admin.from("service_areas").update({ is_active: false }).eq("name", "Houston, TX");
    // Pasadena still covers Houston (about 10 miles apart) and Baytown.
    expect(await repository.contains(HOUSTON.lat, HOUSTON.lng)).toBe(true);

    await admin.from("service_areas").update({ radius_miles: 5 }).eq("name", "Pasadena, TX");
    expect(await repository.contains(HOUSTON.lat, HOUSTON.lng)).toBe(false);
    expect(await repository.contains(BAYTOWN.lat, BAYTOWN.lng)).toBe(false);

    await admin.from("service_areas").update({ is_active: true }).eq("name", "Houston, TX");
    expect(await repository.contains(HOUSTON.lat, HOUSTON.lng)).toBe(true);
  });

  it("a signed-in driver cannot read or change the table itself", async () => {
    const read = await driver.client.from("service_areas").select("*");
    expect(read.error?.code).toBe("42501");
    const write = await driver.client
      .from("service_areas")
      .update({ is_active: false })
      .eq("name", "Houston, TX");
    expect(write.error?.code).toBe("42501");
  });

  it("an anonymous visitor can neither read the table nor ask the question", async () => {
    const read = await anonClient().from("service_areas").select("*");
    expect(read.error?.code).toBe("42501");
    const anonymous = new ServiceAreaRepository(anonClient());
    const error = await anonymous.contains(HOUSTON.lat, HOUSTON.lng).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("FORBIDDEN");
  });

  it("the service role reads the seeded launch areas", async () => {
    const { data } = await serviceClient()
      .from("service_areas")
      .select("name, center_zip, radius_miles, is_active")
      .order("name");
    expect(data).toEqual([
      { name: "Houston, TX", center_zip: "77002", radius_miles: 50, is_active: true },
      { name: "Pasadena, TX", center_zip: "77506", radius_miles: 50, is_active: true },
    ]);
  });
});
