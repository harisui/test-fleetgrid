import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ShiftRepository } from "@/server/repositories/ShiftRepository";
import {
  cleanupTestUsers,
  createListedDriver,
  createTestCarrier,
  REQUIRED_DOCUMENT_TYPES,
  serviceClient,
  TEST_PLACES,
  type TestCarrier,
  type TestDriver,
} from "../../setup/supabase";

const REQUIREMENTS = {
  cdlClass: "A" as const,
  endorsements: [],
  minYears: 0,
  equipmentTypes: [],
  twicRequired: false,
  medicalRequired: false,
  manualRequired: false,
};

/**
 * CR-5 part 3 through real clients: a Registered driver, with or without documents, never
 * appears in a carrier's search, never counts in the match preview and is never offered a
 * shift; a Roster-Ready driver is.
 */
describe("only Roster-Ready drivers reach carriers", () => {
  let carrier: TestCarrier;
  let ready: TestDriver;
  let registered: TestDriver;
  let registeredWithDocuments: TestDriver;

  beforeAll(async () => {
    carrier = await createTestCarrier({ subscription: "active" });
    [ready, registered, registeredWithDocuments] = await Promise.all([
      createListedDriver({ fullName: "Ready Driver", place: TEST_PLACES.pasadena }),
      createListedDriver({ fullName: "Registered Driver", place: TEST_PLACES.pasadena, status: "pending" }),
      createListedDriver({ fullName: "Waiting Driver", place: TEST_PLACES.pasadena, status: "pending" }),
    ]);
    const { error } = await serviceClient()
      .from("driver_documents")
      .insert(
        REQUIRED_DOCUMENT_TYPES.map((type) => ({
          driver_id: registeredWithDocuments.driverId,
          type,
          storage_path: `${registeredWithDocuments.driverId}/${type}.png`,
          file_name: `${type}.png`,
          mime_type: "image/png",
          size_bytes: 68,
        })),
      );
    if (error) throw error;
  });

  afterAll(cleanupTestUsers);

  const mine = () => [ready, registered, registeredWithDocuments].map((driver) => driver.driverId);

  it("the carrier's search lists the Roster-Ready driver only", async () => {
    const { data, error } = await carrier.client.rpc("search_drivers", {
      p_lat: TEST_PLACES.pasadena.lat,
      p_lng: TEST_PLACES.pasadena.lng,
      p_radius_miles: 25,
      p_limit: 500,
    });
    expect(error).toBeNull();
    const found = (data ?? []).map((row) => row.driver_id).filter((id) => mine().includes(id));
    expect(found).toEqual([ready.driverId]);
  });

  it("the match preview and the broadcast count the Roster-Ready driver only", async () => {
    const matches = await new ShiftRepository(serviceClient()).matchingDrivers(TEST_PLACES.pasadena, REQUIREMENTS);
    const found = matches.map((match) => match.driverId).filter((id) => mine().includes(id));
    expect(found).toEqual([ready.driverId]);
  });

  it("a carrier cannot read a Registered card directly either", async () => {
    const { data } = await carrier.client.from("drivers").select("id").in("id", mine());
    expect((data ?? []).map((row) => row.id)).toEqual([ready.driverId]);
  });
});
