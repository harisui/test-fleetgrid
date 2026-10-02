import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database.types";
import {
  anonClient,
  cleanupTestUsers,
  createTestUser,
  serviceClient,
  type TestUser,
} from "../../setup/supabase";

describe("RLS through real clients: profiles and tos_acceptances", () => {
  let driverA: TestUser;
  let driverB: TestUser;
  let carrier: TestUser;
  let admin: TestUser;
  let newcomer: TestUser;

  beforeAll(async () => {
    [driverA, driverB, carrier, admin, newcomer] = await Promise.all([
      createTestUser({ role: "driver" }),
      createTestUser({ role: "driver", status: "approved" }),
      createTestUser({ role: "carrier" }),
      createTestUser({ role: "admin", status: "approved" }),
      createTestUser(),
    ]);
    await serviceClient()
      .from("tos_acceptances")
      .insert([
        { profile_id: driverB.id, version: "v1" },
        { profile_id: carrier.id, version: "v1" },
      ]);
  });

  afterAll(cleanupTestUsers);

  describe("anonymous visitor", () => {
    it.each(["profiles", "drivers", "driver_documents", "tos_acceptances"] as const)(
      "cannot read %s",
      async (table) => {
        const { data, error } = await anonClient().from(table).select("*");
        expect(error).not.toBeNull();
        expect(data).toBeNull();
      },
    );

    it("cannot create a profile", async () => {
      const { error } = await anonClient()
        .from("profiles")
        .insert({ id: newcomer.id, role: "driver", phone: newcomer.phone });
      expect(error).not.toBeNull();
    });
  });

  describe("driver", () => {
    it("reads only their own profile", async () => {
      const { data, error } = await driverA.client.from("profiles").select("id, role, status");
      expect(error).toBeNull();
      expect(data).toEqual([{ id: driverA.id, role: "driver", status: "pending" }]);
    });

    it("cannot read another user's profile", async () => {
      const { data } = await driverA.client.from("profiles").select("id").eq("id", driverB.id);
      expect(data).toEqual([]);
    });

    it("cannot change their own role or status", async () => {
      const role = await driverA.client
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", driverA.id);
      expect(role.error?.message).toMatch(/role is not allowed/);

      const status = await driverA.client
        .from("profiles")
        .update({ status: "approved" })
        .eq("id", driverA.id);
      expect(status.error?.message).toMatch(/status is not allowed/);

      const { data } = await serviceClient()
        .from("profiles")
        .select("role, status")
        .eq("id", driverA.id)
        .single();
      expect(data).toEqual({ role: "driver", status: "pending" });
    });

    it("cannot update or delete another user's profile", async () => {
      const update = await driverA.client
        .from("profiles")
        .update({ status: "blocked" })
        .eq("id", driverB.id)
        .select();
      expect(update.data).toEqual([]);

      const remove = await driverA.client.from("profiles").delete().eq("id", driverB.id).select();
      expect(remove.data).toEqual([]);

      const { data } = await serviceClient()
        .from("profiles")
        .select("status")
        .eq("id", driverB.id)
        .single();
      expect(data?.status).toBe("approved");
    });

    it("records and reads only their own terms acceptance", async () => {
      const own = await driverA.client
        .from("tos_acceptances")
        .insert({ profile_id: driverA.id, version: "v1" });
      expect(own.error).toBeNull();

      const other = await driverA.client
        .from("tos_acceptances")
        .insert({ profile_id: driverB.id, version: "v2" });
      expect(other.error).not.toBeNull();

      const { data } = await driverA.client.from("tos_acceptances").select("profile_id");
      expect(data).toEqual([{ profile_id: driverA.id }]);
    });
  });

  describe("carrier", () => {
    it("reads only their own profile and terms acceptance", async () => {
      const profiles = await carrier.client.from("profiles").select("id");
      expect(profiles.data).toEqual([{ id: carrier.id }]);

      const terms = await carrier.client.from("tos_acceptances").select("profile_id");
      expect(terms.data).toEqual([{ profile_id: carrier.id }]);
    });

    it("cannot approve themselves", async () => {
      const { error } = await carrier.client
        .from("profiles")
        .update({ status: "approved" })
        .eq("id", carrier.id);
      expect(error?.message).toMatch(/status is not allowed/);
    });
  });

  describe("profile creation", () => {
    it("rejects admin role, pre-approved status, a foreign id and an unverified phone", async () => {
      const attempts: Database["public"]["Tables"]["profiles"]["Insert"][] = [
        { id: newcomer.id, role: "admin", phone: newcomer.phone },
        {
          id: newcomer.id,
          role: "driver",
          phone: newcomer.phone,
          status: "approved",
        },
        { id: driverA.id, role: "driver", phone: newcomer.phone },
        { id: newcomer.id, role: "driver", phone: "+15555550000" },
      ];
      for (const attempt of attempts) {
        const { error } = await newcomer.client.from("profiles").insert(attempt);
        expect(error, JSON.stringify(attempt)).not.toBeNull();
      }
      const { data } = await serviceClient().from("profiles").select("id").eq("id", newcomer.id);
      expect(data).toEqual([]);
    });

    it("lets a user create their own profile exactly once", async () => {
      const first = await newcomer.client
        .from("profiles")
        .insert({ id: newcomer.id, role: "driver", phone: newcomer.phone })
        .select("role, status")
        .single();
      expect(first.error).toBeNull();
      expect(first.data).toEqual({ role: "driver", status: "pending" });

      const second = await newcomer.client
        .from("profiles")
        .insert({ id: newcomer.id, role: "carrier", phone: newcomer.phone });
      expect(second.error?.code).toBe("23505");
    });
  });

  describe("admin", () => {
    it("reads all profiles and terms acceptances", async () => {
      const profiles = await admin.client
        .from("profiles")
        .select("id")
        .in("id", [driverA.id, driverB.id, carrier.id, admin.id]);
      expect(profiles.data).toHaveLength(4);

      const terms = await admin.client
        .from("tos_acceptances")
        .select("profile_id")
        .in("profile_id", [driverB.id, carrier.id]);
      expect(terms.data).toHaveLength(2);
    });

    it("can change another user's status", async () => {
      const { data, error } = await admin.client
        .from("profiles")
        .update({ status: "blocked" })
        .eq("id", carrier.id)
        .select("status")
        .single();
      expect(error).toBeNull();
      expect(data?.status).toBe("blocked");
    });
  });
});
