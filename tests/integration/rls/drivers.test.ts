import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  cleanupTestUsers,
  createTestDriver,
  createTestUser,
  serviceClient,
  type TestDriver,
  type TestUser,
} from "../../setup/supabase";

describe("RLS through real clients: drivers and driver_documents", () => {
  let driverA: TestDriver;
  let driverB: TestDriver;
  let driverNoCard: TestUser;
  let carrier: TestUser;
  let admin: TestUser;
  let docA: string;
  let docB: string;

  const documentRow = (driverId: string, file: string) => ({
    driver_id: driverId,
    type: "cdl_front" as const,
    storage_path: `${driverId}/${file}`,
    file_name: file,
    mime_type: "image/jpeg",
    size_bytes: 1234,
  });

  beforeAll(async () => {
    [driverA, driverB, driverNoCard, carrier, admin] = await Promise.all([
      createTestDriver({ fullName: "Driver A" }),
      createTestDriver({ fullName: "Driver B" }),
      createTestUser({ role: "driver" }),
      createTestUser({ role: "carrier", status: "approved" }),
      createTestUser({ role: "admin", status: "approved" }),
    ]);
    const { data, error } = await serviceClient()
      .from("driver_documents")
      .insert([documentRow(driverA.driverId, "a.jpg"), documentRow(driverB.driverId, "b.jpg")])
      .select("id, driver_id");
    if (error) throw error;
    docA = data.find((row) => row.driver_id === driverA.driverId)!.id;
    docB = data.find((row) => row.driver_id === driverB.driverId)!.id;
  });

  afterAll(cleanupTestUsers);

  describe("anonymous visitor", () => {
    it("cannot read or write drivers", async () => {
      const read = await anonClient().from("drivers").select("id");
      expect(read.error).not.toBeNull();

      const update = await anonClient()
        .from("drivers")
        .update({ city: "Hacked" })
        .eq("id", driverA.driverId);
      expect(update.error).not.toBeNull();
    });
  });

  describe("driver", () => {
    it("reads only their own card", async () => {
      const { data, error } = await driverA.client.from("drivers").select("id, full_name");
      expect(error).toBeNull();
      expect(data).toEqual([{ id: driverA.driverId, full_name: "Driver A" }]);
    });

    it("updates their own card", async () => {
      const { data, error } = await driverA.client
        .from("drivers")
        .update({
          operator_types: ["cdl_driver"],
          cdl_class: "A",
          endorsements: ["H"],
          years_experience: 7,
          onboarding_step: 3,
        })
        .eq("id", driverA.driverId)
        .select("cdl_class, years_experience, onboarding_step")
        .single();
      expect(error).toBeNull();
      expect(data).toEqual({ cdl_class: "A", years_experience: 7, onboarding_step: 3 });
    });

    it("cannot read, update or delete another driver's card", async () => {
      const read = await driverA.client.from("drivers").select("id").eq("id", driverB.driverId);
      expect(read.data).toEqual([]);

      const update = await driverA.client
        .from("drivers")
        .update({ full_name: "Hacked" })
        .eq("id", driverB.driverId)
        .select();
      expect(update.data).toEqual([]);

      const remove = await driverA.client
        .from("drivers")
        .delete()
        .eq("id", driverB.driverId)
        .select();
      expect(remove.data).toEqual([]);

      const { data } = await serviceClient()
        .from("drivers")
        .select("full_name")
        .eq("id", driverB.driverId)
        .single();
      expect(data?.full_name).toBe("Driver B");
    });

    it("cannot delete their own card", async () => {
      const { data } = await driverA.client
        .from("drivers")
        .delete()
        .eq("id", driverA.driverId)
        .select();
      expect(data).toEqual([]);
    });

    it("cannot change their own SMS opt-out state", async () => {
      const { error } = await driverA.client
        .from("drivers")
        .update({ sms_opted_out: true })
        .eq("id", driverA.driverId);
      expect(error?.message).toMatch(/opt-out state is not allowed/);
    });

    it("creates their own card once, and never for someone else", async () => {
      const foreign = await driverNoCard.client
        .from("drivers")
        .insert({ profile_id: driverA.id, full_name: "Fake", state: "TX", zip: "75201" });
      expect(foreign.error).not.toBeNull();

      const own = await driverNoCard.client
        .from("drivers")
        .insert({ profile_id: driverNoCard.id, full_name: "New Driver", state: "TX", zip: "75201" })
        .select("onboarding_step, card_completed")
        .single();
      expect(own.error).toBeNull();
      expect(own.data).toEqual({ onboarding_step: 1, card_completed: false });

      const again = await driverNoCard.client
        .from("drivers")
        .insert({ profile_id: driverNoCard.id, full_name: "Twice", state: "TX", zip: "75201" });
      expect(again.error?.code).toBe("23505");
    });

    it("reads, adds and deletes only their own documents", async () => {
      const read = await driverA.client.from("driver_documents").select("id");
      expect(read.data).toEqual([{ id: docA }]);

      const add = await driverA.client
        .from("driver_documents")
        .insert(documentRow(driverA.driverId, "mine.jpg"))
        .select("id")
        .single();
      expect(add.error).toBeNull();

      const addForeign = await driverA.client
        .from("driver_documents")
        .insert(documentRow(driverB.driverId, "intruder.jpg"));
      expect(addForeign.error).not.toBeNull();

      const wrongFolder = await driverA.client.from("driver_documents").insert({
        ...documentRow(driverA.driverId, "x.jpg"),
        storage_path: `${driverB.driverId}/x.jpg`,
      });
      expect(wrongFolder.error).not.toBeNull();

      const removeForeign = await driverA.client
        .from("driver_documents")
        .delete()
        .eq("id", docB)
        .select();
      expect(removeForeign.data).toEqual([]);

      const removeOwn = await driverA.client
        .from("driver_documents")
        .delete()
        .eq("id", add.data!.id)
        .select();
      expect(removeOwn.data).toHaveLength(1);
    });
  });

  describe("carrier (Milestone 1)", () => {
    it("has no access to driver cards or documents", async () => {
      const drivers = await carrier.client.from("drivers").select("id");
      expect(drivers.data).toEqual([]);

      const documents = await carrier.client.from("driver_documents").select("id");
      expect(documents.data).toEqual([]);

      const insert = await carrier.client
        .from("drivers")
        .insert({ profile_id: carrier.id, full_name: "Carrier", state: "TX", zip: "75201" });
      expect(insert.error).not.toBeNull();
    });
  });

  describe("admin", () => {
    it("reads and updates every card and document", async () => {
      const drivers = await admin.client
        .from("drivers")
        .select("id")
        .in("id", [driverA.driverId, driverB.driverId]);
      expect(drivers.data).toHaveLength(2);

      const documents = await admin.client
        .from("driver_documents")
        .select("id")
        .in("id", [docA, docB]);
      expect(documents.data).toHaveLength(2);

      const update = await admin.client
        .from("drivers")
        .update({ sms_opted_out: true, sms_opted_out_at: new Date().toISOString() })
        .eq("id", driverB.driverId)
        .select("sms_opted_out")
        .single();
      expect(update.error).toBeNull();
      expect(update.data?.sms_opted_out).toBe(true);

      const remove = await admin.client.from("driver_documents").delete().eq("id", docB).select();
      expect(remove.data).toHaveLength(1);
    });
  });
});
