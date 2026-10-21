import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { CarrierRepository } from "@/server/repositories/CarrierRepository";
import { DriverSearchRepository } from "@/server/repositories/DriverSearchRepository";
import { SubscriptionRepository } from "@/server/repositories/SubscriptionRepository";
import { TosRepository } from "@/server/repositories/TosRepository";
import { WaitlistRepository } from "@/server/repositories/WaitlistRepository";
import { WebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import {
  cleanupTestUsers,
  createListedDriver,
  createTestCarrier,
  createTestUser,
  serviceClient,
  TEST_PLACES,
  type TestCarrier,
  type TestDriver,
  type TestUser,
} from "../../setup/supabase";

/**
 * The carrier-side repositories against the local database, as the signed-in carrier where
 * the carrier may act, and as the service role where only the server may (subscriptions,
 * webhook events, the Stripe customer id).
 */
describe("carrier-side repositories", () => {
  let carrierUser: TestUser;
  let subscribed: TestCarrier;
  let listedNear: TestDriver;
  let listedFar: TestDriver;

  beforeAll(async () => {
    [carrierUser, subscribed, listedNear, listedFar] = await Promise.all([
      createTestUser({ role: "carrier", status: "approved" }),
      createTestCarrier({ subscription: "active" }),
      createListedDriver({ fullName: "Near Driver" }),
      createListedDriver({
        fullName: "Far Driver",
        place: TEST_PLACES.pasadena,
        cdl_class: "B",
        twic_active: false,
      }),
    ]);
  });

  afterAll(cleanupTestUsers);

  describe("CarrierRepository", () => {
    it("creates, finds and updates the carrier's own row, mapped to camelCase", async () => {
      const repository = new CarrierRepository(carrierUser.client);
      expect(await repository.findByProfileId(carrierUser.id)).toBeNull();

      const created = await repository.create(carrierUser.id, {
        companyName: "Repo Freight",
        contactName: "Repo Owner",
        billingEmail: "repo@example.com",
        usdot: "1234",
        mc: null,
        city: "Houston",
        state: "TX",
        zip: "77002",
        lat: 29.7594,
        lng: -95.3594,
      });
      expect(created).toMatchObject({
        profileId: carrierUser.id,
        companyName: "Repo Freight",
        usdot: "1234",
        mc: null,
        lat: 29.7594,
        lng: -95.3594,
        stripeCustomerId: null,
      });
      expect(await repository.findById(created.id)).toEqual(created);
      expect(await repository.findByProfileId(carrierUser.id)).toEqual(created);

      const updated = await repository.update(created.id, { contactName: "New Owner", mc: "77" });
      expect(updated).toMatchObject({ contactName: "New Owner", mc: "77", companyName: "Repo Freight" });

      // The Stripe customer id is the service role's to set.
      const forbidden = await repository
        .update(created.id, { stripeCustomerId: "cus_forged" })
        .catch((error) => error);
      expect(forbidden).toBeInstanceOf(AppError);
      expect((forbidden as AppError).code).toBe("FORBIDDEN");

      const admin = new CarrierRepository(serviceClient());
      await admin.update(created.id, { stripeCustomerId: "cus_repo_1" });
      expect((await admin.findByStripeCustomerId("cus_repo_1"))?.id).toBe(created.id);
      expect(await admin.findByStripeCustomerId("cus_nobody")).toBeNull();
      // The reconcile's list: every carrier with a customer, and only those.
      const withCustomer = await admin.listWithStripeCustomer();
      expect(withCustomer.map((row) => row.id)).toContain(created.id);
      expect(withCustomer.every((row) => row.stripeCustomerId !== null)).toBe(true);
    });

    it("translates a second row into a CONFLICT", async () => {
      const repository = new CarrierRepository(carrierUser.client);
      const error = await repository
        .create(carrierUser.id, {
          companyName: "Twice",
          contactName: "Repo Owner",
          billingEmail: "repo@example.com",
          usdot: null,
          mc: null,
          city: "Houston",
          state: "TX",
          zip: "77002",
          lat: 29.7594,
          lng: -95.3594,
        })
        .catch((caught) => caught);
      expect((error as AppError).code).toBe("CONFLICT");
    });
  });

  describe("SubscriptionRepository", () => {
    it("upserts by the Stripe id with the service role; the carrier reads the result", async () => {
      const admin = new SubscriptionRepository(serviceClient());
      const stripeId = `sub_repo_${randomUUID().slice(0, 8)}`;
      const first = await admin.upsert({
        carrierId: subscribed.carrierId,
        stripeSubscriptionId: stripeId,
        stripeCustomerId: "cus_repo_sub",
        status: "trialing",
        priceId: "price_m",
        currentPeriodEnd: "2026-11-13T12:00:00.000Z",
        cancelAtPeriodEnd: false,
        canceledAt: null,
      });
      expect(first).toMatchObject({ status: "trialing", stripeSubscriptionId: stripeId });

      const second = await admin.upsert({
        carrierId: subscribed.carrierId,
        stripeSubscriptionId: stripeId,
        stripeCustomerId: "cus_repo_sub",
        status: "canceled",
        priceId: "price_m",
        currentPeriodEnd: "2026-11-13T12:00:00.000Z",
        cancelAtPeriodEnd: false,
        canceledAt: "2026-10-13T12:00:00.000Z",
      });
      expect(second.id).toBe(first.id);
      expect(second.status).toBe("canceled");

      const mine = new SubscriptionRepository(subscribed.client);
      expect((await mine.findByStripeId(stripeId))?.status).toBe("canceled");
      expect((await mine.findCurrentByCarrierId(subscribed.carrierId))?.stripeSubscriptionId).toBe(stripeId);
      // The seeded active one still grants access.
      expect((await mine.findActiveByCarrierId(subscribed.carrierId))?.status).toBe("active");
      expect(await mine.findActiveByCarrierId(randomUUID())).toBeNull();
    });
  });

  describe("WebhookEventRepository", () => {
    it("records an event once and can forget it", async () => {
      const repository = new WebhookEventRepository(serviceClient());
      const eventId = `evt_${randomUUID()}`;
      expect(await repository.recordOnce({ provider: "stripe", eventId, type: "invoice.paid" })).toBe(true);
      expect(await repository.recordOnce({ provider: "stripe", eventId, type: "invoice.paid" })).toBe(false);
      await repository.forget("stripe", eventId);
      expect(await repository.recordOnce({ provider: "stripe", eventId, type: "invoice.paid" })).toBe(true);
      await repository.forget("stripe", eventId);
    });
  });

  describe("WaitlistRepository", () => {
    it("adds the carrier once and finds the entry", async () => {
      const repository = new WaitlistRepository(subscribed.client);
      expect(await repository.findByCarrierId(subscribed.carrierId)).toBeNull();
      const entry = await repository.create({
        carrierId: subscribed.carrierId,
        zip: "75201",
        lat: 32.7904,
        lng: -96.8044,
      });
      expect(entry).toMatchObject({ carrierId: subscribed.carrierId, zip: "75201", lat: 32.7904 });
      const again = await repository.create({
        carrierId: subscribed.carrierId,
        zip: "75201",
        lat: 32.7904,
        lng: -96.8044,
      });
      expect(again.id).toBe(entry.id);
      expect((await repository.findByCarrierId(subscribed.carrierId))?.id).toBe(entry.id);
    });
  });

  describe("TosRepository", () => {
    it("records an acceptance with its context, once per version", async () => {
      const repository = new TosRepository(subscribed.client);
      expect(await repository.findAcceptance(subscribed.id, "2026-10-v1")).toBeNull();
      const first = await repository.record({
        profileId: subscribed.id,
        version: "2026-10-v1",
        ip: "203.0.113.7",
        userAgent: "Mozilla/5.0 (test)",
      });
      expect(first).toMatchObject({
        profileId: subscribed.id,
        version: "2026-10-v1",
        ip: "203.0.113.7",
        userAgent: "Mozilla/5.0 (test)",
      });
      const again = await repository.record({
        profileId: subscribed.id,
        version: "2026-10-v1",
        ip: null,
        userAgent: null,
      });
      expect(again.id).toBe(first.id);
      expect(again.ip).toBe("203.0.113.7");
      expect((await repository.findAcceptance(subscribed.id, "2026-10-v1"))?.id).toBe(first.id);
      expect(await repository.findAcceptance(subscribed.id, "2027-01-v2")).toBeNull();
    });
  });

  describe("DriverSearchRepository", () => {
    it("returns the matching cards nearest first with the total, and one card by id", async () => {
      const repository = new DriverSearchRepository(subscribed.client);
      const yard = TEST_PLACES.houston;
      const { matches, total } = await repository.search({
        lat: yard.lat,
        lng: yard.lng,
        radiusMiles: 50,
        endorsements: [],
        equipmentTypes: [],
        limit: 100,
        offset: 0,
      });
      expect(total).toBe(matches.length);
      const near = matches.find((match) => match.driver.id === listedNear.driverId);
      const far = matches.find((match) => match.driver.id === listedFar.driverId);
      expect(near).toMatchObject({ distanceMiles: 0, driver: { fullName: "Near Driver" } });
      expect(far).toMatchObject({ distanceMiles: 10.4, driver: { fullName: "Far Driver" } });
      expect(matches.indexOf(near!)).toBeLessThan(matches.indexOf(far!));

      const twic = await repository.search({
        lat: yard.lat,
        lng: yard.lng,
        radiusMiles: 50,
        endorsements: [],
        equipmentTypes: [],
        twicActive: false,
        limit: 100,
        offset: 0,
      });
      expect(twic.matches.map((match) => match.driver.id)).toContain(listedFar.driverId);
      expect(twic.matches.map((match) => match.driver.id)).not.toContain(listedNear.driverId);

      expect((await repository.findById(listedNear.driverId))?.fullName).toBe("Near Driver");
      expect(await repository.findById(randomUUID())).toBeNull();
    });

    it("is empty for a carrier without access, so nothing leaks", async () => {
      const repository = new DriverSearchRepository(carrierUser.client);
      const { matches, total } = await repository.search({
        lat: TEST_PLACES.houston.lat,
        lng: TEST_PLACES.houston.lng,
        radiusMiles: 50,
        endorsements: [],
        equipmentTypes: [],
        limit: 20,
        offset: 0,
      });
      expect(matches).toEqual([]);
      expect(total).toBe(0);
      expect(await repository.findById(listedNear.driverId)).toBeNull();
    });
  });
});
