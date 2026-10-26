import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  cleanupTestUsers,
  createListedDriver,
  createTestCarrier,
  createTestDriver,
  createTestUser,
  DOCUMENTS_BUCKET,
  serviceClient,
  TEST_FILES,
  TEST_PLACES,
  type TestCarrier,
  type TestDriver,
  type TestUser,
} from "../../setup/supabase";

/**
 * The carrier side through real signed-in clients (0015): who sees carrier rows,
 * subscriptions and the waitlist, and which driver cards, documents and files a carrier can
 * reach while subscribed.
 */
describe("RLS through real clients: carriers, subscriptions and what carriers see of drivers", () => {
  let subscribed: TestCarrier;
  let trialing: TestCarrier;
  let unpaid: TestCarrier;
  let lapsed: TestCarrier;
  let listedHouston: TestDriver;
  let listedPasadena: TestDriver;
  let pendingDriver: TestDriver;
  let optedOut: TestDriver;
  let declined: TestDriver;
  let outOfArea: TestDriver;
  let incomplete: TestDriver;
  let driverOnly: TestDriver;
  let admin: TestUser;
  let listedDoc: string;
  let pendingDoc: string;

  const testDriverIds = () =>
    [
      listedHouston,
      listedPasadena,
      pendingDriver,
      optedOut,
      declined,
      outOfArea,
      incomplete,
      driverOnly,
    ].map((driver) => driver.driverId);

  const documentRow = (driverId: string, file: string) => ({
    driver_id: driverId,
    type: "cdl_front" as const,
    storage_path: `${driverId}/${file}`,
    file_name: file,
    mime_type: "image/png",
    size_bytes: 68,
  });

  beforeAll(async () => {
    [subscribed, trialing, unpaid, lapsed] = await Promise.all([
      createTestCarrier({ subscription: "active" }),
      createTestCarrier({ subscription: "trialing" }),
      createTestCarrier(),
      createTestCarrier({ subscription: "past_due" }),
    ]);
    [
      listedHouston,
      listedPasadena,
      pendingDriver,
      optedOut,
      declined,
      outOfArea,
      incomplete,
      driverOnly,
    ] = await Promise.all([
        createListedDriver({ fullName: "Listed Houston" }),
        createListedDriver({
          fullName: "Listed Pasadena",
          place: TEST_PLACES.pasadena,
          cdl_class: "B",
          endorsements: ["T"],
          years_experience: 2,
          twic_active: false,
          transmission: "automatic_only",
          equipment_types: ["dry_van"],
          mvr_status: "minor_1_2",
        }),
        createListedDriver({ fullName: "Pending", status: "pending" }),
        createListedDriver({
          fullName: "Opted out",
          sms_opted_out: true,
          sms_opted_out_at: new Date().toISOString(),
        }),
        // Finished the card without ticking the shift-text box (optional since 0016).
        createListedDriver({
          fullName: "Declined texts",
          sms_opt_in: false,
          sms_opt_in_at: null,
          sms_opt_in_text: null,
        }),
        createListedDriver({ fullName: "Dallas", place: TEST_PLACES.dallas }),
        createListedDriver({
          fullName: "Incomplete",
          card_completed: false,
          onboarding_step: 10,
          equipment_types: [],
        }),
        createTestDriver({ fullName: "Plain driver" }),
      ]);

    const admin_ = serviceClient();
    const { data, error } = await admin_
      .from("driver_documents")
      .insert([
        documentRow(listedHouston.driverId, "listed.png"),
        documentRow(pendingDriver.driverId, "pending.png"),
      ])
      .select("id, driver_id");
    if (error) throw error;
    listedDoc = data.find((row) => row.driver_id === listedHouston.driverId)!.id;
    pendingDoc = data.find((row) => row.driver_id === pendingDriver.driverId)!.id;
    for (const driver of [listedHouston, pendingDriver]) {
      const file = driver === listedHouston ? "listed.png" : "pending.png";
      const upload = await admin_.storage
        .from(DOCUMENTS_BUCKET)
        .upload(`${driver.driverId}/${file}`, TEST_FILES.png(), { contentType: "image/png" });
      if (upload.error) throw upload.error;
    }
    admin = await createTestUser({ role: "admin", status: "approved" });
  });

  afterAll(cleanupTestUsers);

  describe("anonymous visitor", () => {
    it.each(["carriers", "subscriptions", "carrier_waitlist", "webhook_events"] as const)(
      "cannot read %s",
      async (table) => {
        const { data, error } = await anonClient().from(table).select("*");
        expect(error).not.toBeNull();
        expect(data).toBeNull();
      },
    );

    it("cannot search", async () => {
      const { error } = await anonClient().rpc("search_drivers", {
        p_lat: TEST_PLACES.houston.lat,
        p_lng: TEST_PLACES.houston.lng,
        p_radius_miles: 50,
      });
      expect(error).not.toBeNull();
    });
  });

  describe("a subscribed carrier", () => {
    it("reads and edits only their own carrier row", async () => {
      const { data } = await subscribed.client.from("carriers").select("id, company_name");
      expect(data).toEqual([{ id: subscribed.carrierId, company_name: "Test Freight" }]);

      const own = await subscribed.client
        .from("carriers")
        .update({ contact_name: "New Owner" })
        .eq("id", subscribed.carrierId)
        .select("contact_name")
        .single();
      expect(own.data?.contact_name).toBe("New Owner");

      const other = await subscribed.client
        .from("carriers")
        .update({ contact_name: "Hacked" })
        .eq("id", unpaid.carrierId)
        .select();
      expect(other.data).toEqual([]);
    });

    it("cannot change their Stripe customer id or create a subscription", async () => {
      const customer = await subscribed.client
        .from("carriers")
        .update({ stripe_customer_id: "cus_forged" })
        .eq("id", subscribed.carrierId);
      expect(customer.error?.message).toMatch(/billing customer is not allowed/);

      const forged = await subscribed.client.from("subscriptions").insert({
        carrier_id: subscribed.carrierId,
        stripe_subscription_id: "sub_forged",
        stripe_customer_id: "cus_forged",
        status: "active",
      });
      expect(forged.error).not.toBeNull();
    });

    it("sees only their own subscription and no webhook events", async () => {
      const { data } = await subscribed.client.from("subscriptions").select("carrier_id, status");
      expect(data).toEqual([{ carrier_id: subscribed.carrierId, status: "active" }]);
      const events = await subscribed.client.from("webhook_events").select("id");
      expect(events.error).not.toBeNull();
    });

    it("sees the listed cards only: approved, complete, inside a launch area, texts or not", async () => {
      // The seed's Houston drivers are listed too, so look at this test's drivers only.
      const { data, error } = await subscribed.client
        .from("drivers")
        .select("full_name, sms_opt_in, sms_opted_out")
        .in("id", testDriverIds())
        .order("full_name");
      expect(error).toBeNull();
      expect(data).toEqual([
        { full_name: "Declined texts", sms_opt_in: false, sms_opted_out: false },
        { full_name: "Listed Houston", sms_opt_in: true, sms_opted_out: false },
        { full_name: "Listed Pasadena", sms_opt_in: true, sms_opted_out: false },
        { full_name: "Opted out", sms_opt_in: true, sms_opted_out: true },
      ]);
    });

    it("never reads a driver's profile, so never the phone number", async () => {
      const { data } = await subscribed.client
        .from("profiles")
        .select("id")
        .eq("id", listedHouston.id);
      expect(data).toEqual([]);
    });

    it("cannot edit a card", async () => {
      const { data } = await subscribed.client
        .from("drivers")
        .update({ full_name: "Hacked" })
        .eq("id", listedHouston.driverId)
        .select();
      expect(data).toEqual([]);
    });

    it("sees the documents of listed drivers and can make a signed link to their files", async () => {
      const { data } = await subscribed.client.from("driver_documents").select("id");
      expect(data).toEqual([{ id: listedDoc }]);

      const listed = await subscribed.client.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(`${listedHouston.driverId}/listed.png`, 60);
      expect(listed.error).toBeNull();
      expect(listed.data?.signedUrl).toContain("token=");

      const pending = await subscribed.client.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(`${pendingDriver.driverId}/pending.png`, 60);
      expect(pending.error).not.toBeNull();
      expect(pendingDoc).toBeTruthy();
    });

    it("searches by distance from the yard with the filters", async () => {
      // The seed's drivers are in the results too (the function sees what RLS allows), so
      // the checks are about this test's drivers and the order, not the whole list.
      const yard = TEST_PLACES.houston;
      const search = (filters: Record<string, unknown> = {}) =>
        subscribed.client.rpc("search_drivers", {
          p_lat: yard.lat,
          p_lng: yard.lng,
          p_radius_miles: 50,
          p_limit: 100,
          ...filters,
        });

      const all = await search();
      expect(all.error).toBeNull();
      const rows = all.data ?? [];
      const ids = rows.map((row) => row.driver_id);
      expect(ids).toContain(listedHouston.driverId);
      expect(ids).toContain(listedPasadena.driverId);
      expect(ids).toContain(optedOut.driverId);
      expect(ids).toContain(declined.driverId);
      for (const hidden of [pendingDriver, outOfArea, incomplete, driverOnly]) {
        expect(ids).not.toContain(hidden.driverId);
      }
      expect(rows.find((row) => row.driver_id === listedHouston.driverId)).toMatchObject({
        distance_miles: 0,
        total_count: rows.length,
      });
      expect(rows.find((row) => row.driver_id === listedPasadena.driverId)?.distance_miles).toBe(
        10.4,
      );
      const distances = rows.map((row) => row.distance_miles);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));

      const classA = await search({ p_cdl_class: "A" });
      const classAIds = classA.data?.map((row) => row.driver_id) ?? [];
      expect(classAIds).toContain(listedHouston.driverId);
      expect(classAIds).not.toContain(listedPasadena.driverId);

      const noTwic = await search({ p_twic: false });
      const noTwicIds = noTwic.data?.map((row) => row.driver_id) ?? [];
      expect(noTwicIds).toContain(listedPasadena.driverId);
      expect(noTwicIds).not.toContain(listedHouston.driverId);

      const page = await search({ p_limit: 1, p_offset: 1 });
      expect(page.data).toHaveLength(1);
      expect(page.data?.[0]).toMatchObject({ driver_id: ids[1], total_count: rows.length });
    });
  });

  describe("a trialing carrier", () => {
    it("has the same access as an active one", async () => {
      const { data } = await trialing.client.from("drivers").select("id").in("id", testDriverIds());
      expect(data?.map((row) => row.id).sort()).toEqual(
        [
          listedHouston.driverId,
          listedPasadena.driverId,
          optedOut.driverId,
          declined.driverId,
        ].sort(),
      );
    });
  });

  describe("a carrier without an active subscription", () => {
    it.each([
      ["no subscription", () => unpaid],
      ["a past_due subscription", () => lapsed],
    ])("with %s sees no cards, documents, files or search results", async (_, carrier) => {
      const { client } = carrier();
      expect((await client.from("drivers").select("id")).data).toEqual([]);
      expect((await client.from("driver_documents").select("id")).data).toEqual([]);
      const file = await client.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(`${listedHouston.driverId}/listed.png`, 60);
      expect(file.error).not.toBeNull();
      const search = await client.rpc("search_drivers", {
        p_lat: TEST_PLACES.houston.lat,
        p_lng: TEST_PLACES.houston.lng,
        p_radius_miles: 50,
      });
      expect(search.error).toBeNull();
      expect(search.data).toEqual([]);
    });

    it("can join the waitlist once, for themselves only", async () => {
      const own = await unpaid.client
        .from("carrier_waitlist")
        .insert({ carrier_id: unpaid.carrierId, zip: "75201", lat: 32.7904, lng: -96.8044 })
        .select("carrier_id")
        .single();
      expect(own.error).toBeNull();
      expect(own.data?.carrier_id).toBe(unpaid.carrierId);

      const again = await unpaid.client
        .from("carrier_waitlist")
        .insert({ carrier_id: unpaid.carrierId, zip: "75201", lat: 32.7904, lng: -96.8044 });
      expect(again.error?.code).toBe("23505");

      const foreign = await unpaid.client
        .from("carrier_waitlist")
        .insert({ carrier_id: subscribed.carrierId, zip: "75201", lat: 32.7904, lng: -96.8044 });
      expect(foreign.error).not.toBeNull();

      const rows = await subscribed.client.from("carrier_waitlist").select("carrier_id");
      expect(rows.data).toEqual([]);
    });
  });

  describe("a driver", () => {
    it("sees no carriers, subscriptions or waitlist, and still only their own card", async () => {
      expect((await driverOnly.client.from("carriers").select("id")).data).toEqual([]);
      expect((await driverOnly.client.from("subscriptions").select("id")).data).toEqual([]);
      expect((await driverOnly.client.from("carrier_waitlist").select("id")).data).toEqual([]);
      const cards = await driverOnly.client.from("drivers").select("id");
      expect(cards.data).toEqual([{ id: driverOnly.driverId }]);
      const insert = await driverOnly.client.from("carriers").insert({
        profile_id: driverOnly.id,
        company_name: "Driver Co",
        contact_name: "Pat",
        billing_email: "pat@example.com",
        city: "Houston",
        state: "TX",
        zip: "77002",
        lat: 29.7594,
        lng: -95.3594,
      });
      expect(insert.error).not.toBeNull();
    });
  });

  describe("an admin", () => {
    it("sees every carrier, subscription and waitlist row", async () => {
      const ids = [subscribed, trialing, unpaid, lapsed].map((carrier) => carrier.carrierId);
      const carriers = await admin.client.from("carriers").select("id").in("id", ids);
      expect(carriers.data).toHaveLength(4);
      const subscriptions = await admin.client
        .from("subscriptions")
        .select("carrier_id")
        .in("carrier_id", ids);
      expect(subscriptions.data).toHaveLength(3);
      const waitlist = await admin.client
        .from("carrier_waitlist")
        .select("carrier_id")
        .eq("carrier_id", unpaid.carrierId);
      expect(waitlist.data).toHaveLength(1);
    });
  });

  it("the out-of-area, pending and incomplete cards exist but are not listed", async () => {
    const { data } = await serviceClient()
      .from("drivers")
      .select("id")
      .in("id", [outOfArea.driverId, pendingDriver.driverId, incomplete.driverId]);
    expect(data).toHaveLength(3);
  });
});
