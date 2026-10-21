// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { TOS_VERSION } from "@/lib/constants";
import { TERMS_MESSAGE } from "@/lib/validation/carrier.schema";
import { ZIP_UNKNOWN_MESSAGE } from "@/lib/validation/onboarding.schema";
import { AppError } from "@/server/errors/AppError";
import { CARRIER_STAGE_PATHS, CarrierService } from "@/server/services/CarrierService";
import { FakeCarrierRepository } from "../../fakes/FakeCarrierRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeServiceAreaRepository } from "../../fakes/FakeServiceAreaRepository";
import { FakeSubscriptionRepository } from "../../fakes/FakeSubscriptionRepository";
import { FakeTosRepository } from "../../fakes/FakeTosRepository";
import { FakeWaitlistRepository } from "../../fakes/FakeWaitlistRepository";
import { FakeZipProvider } from "../../fakes/FakeZipProvider";
import {
  buildCarrier,
  buildCarrierProfile,
  buildProfile,
  buildSubscription,
  CARRIER_USER_ID,
  PLACES,
  USER_ID,
  validCarrierDetails,
} from "../../setup/factories";

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

/** Inside the launch area means within 50 miles of Houston, like the seeded areas. */
const nearHouston = (lat: number, lng: number) =>
  Math.abs(lat - PLACES.houston.lat) < 0.5 && Math.abs(lng - PLACES.houston.lng) < 0.5;

const CONTEXT = { ip: "203.0.113.7", userAgent: "Mozilla/5.0 (test)" };

describe("CarrierService", () => {
  let carriers: FakeCarrierRepository;
  let profiles: FakeProfileRepository;
  let zips: FakeZipProvider;
  let areas: FakeServiceAreaRepository;
  let tos: FakeTosRepository;
  let waitlist: FakeWaitlistRepository;
  let subscriptions: FakeSubscriptionRepository;
  let service: CarrierService;

  beforeEach(() => {
    carriers = new FakeCarrierRepository();
    profiles = new FakeProfileRepository([buildCarrierProfile(), buildProfile()]);
    zips = new FakeZipProvider(Object.values(PLACES));
    areas = new FakeServiceAreaRepository(nearHouston);
    tos = new FakeTosRepository();
    waitlist = new FakeWaitlistRepository();
    subscriptions = new FakeSubscriptionRepository();
    service = new CarrierService(carriers, profiles, zips, areas, tos, waitlist, subscriptions);
  });

  describe("who may use it", () => {
    it("refuses drivers, strangers and blocked carriers", async () => {
      expect((await expectAppError(service.getCarrier(USER_ID))).code).toBe("FORBIDDEN");
      expect((await expectAppError(service.getCarrier("nobody"))).code).toBe("FORBIDDEN");
      profiles.rows.set(CARRIER_USER_ID, buildCarrierProfile({ status: "blocked" }));
      const blocked = await expectAppError(service.getCarrier(CARRIER_USER_ID));
      expect(blocked.message).toMatch(/blocked/);
    });

    it("allows a pending carrier: review is not a gate on the carrier side", async () => {
      profiles.rows.set(CARRIER_USER_ID, buildCarrierProfile({ status: "pending" }));
      await expect(service.getCarrier(CARRIER_USER_ID)).resolves.toBeNull();
    });
  });

  describe("createCarrier", () => {
    it("saves the details with the yard's city, state and coordinates from the dataset", async () => {
      const carrier = await service.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      expect(carrier).toMatchObject({
        profileId: CARRIER_USER_ID,
        companyName: "Bayou Freight LLC",
        contactName: "Maria Lopez",
        billingEmail: "billing@bayoufreight.example",
        usdot: "1234567",
        mc: null,
        city: "Houston",
        state: "TX",
        zip: "77002",
        lat: PLACES.houston.lat,
        lng: PLACES.houston.lng,
        stripeCustomerId: null,
        inServiceArea: true,
      });
      expect(areas.calls).toEqual([{ lat: PLACES.houston.lat, lng: PLACES.houston.lng }]);
    });

    it("marks a yard outside every launch area", async () => {
      const carrier = await service.createCarrier(
        CARRIER_USER_ID,
        validCarrierDetails({ zip: PLACES.dallas.zip }),
      );
      expect(carrier).toMatchObject({ city: "Dallas", inServiceArea: false });
    });

    it("rejects a ZIP the dataset does not know, on the zip field", async () => {
      const error = await expectAppError(
        service.createCarrier(CARRIER_USER_ID, validCarrierDetails({ zip: "99999" })),
      );
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual({ zip: ZIP_UNKNOWN_MESSAGE });
      expect(carriers.rows.size).toBe(0);
    });

    it("validates every field before touching the database", async () => {
      const error = await expectAppError(service.createCarrier(CARRIER_USER_ID, {}));
      expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual([
        "billingEmail",
        "companyName",
        "contactName",
        "zip",
      ]);
    });

    it("refuses a second row, and survives a double submit", async () => {
      await service.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      const again = await expectAppError(
        service.createCarrier(CARRIER_USER_ID, validCarrierDetails()),
      );
      expect(again.code).toBe("CONFLICT");

      // The row appears between the check and the insert (two requests racing).
      carriers.rows.clear();
      const racing = buildCarrier();
      carriers.failNextCreateWith = AppError.conflict();
      carriers.raceWinner = racing;
      const winner = await service.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      expect(winner.id).toBe(racing.id);
    });
  });

  describe("updateCarrier", () => {
    it("edits the details and moves the yard when the ZIP changes", async () => {
      await service.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      const updated = await service.updateCarrier(
        CARRIER_USER_ID,
        validCarrierDetails({ companyName: "Bayou Freight Group", zip: PLACES.dallas.zip, mc: "55" }),
      );
      expect(updated).toMatchObject({
        companyName: "Bayou Freight Group",
        mc: "55",
        city: "Dallas",
        zip: "75201",
        lat: PLACES.dallas.lat,
        inServiceArea: false,
      });
    });

    it("needs the row to exist", async () => {
      const error = await expectAppError(
        service.updateCarrier(CARRIER_USER_ID, validCarrierDetails()),
      );
      expect(error.code).toBe("NOT_FOUND");
    });
  });

  describe("acceptTerms", () => {
    it("records the current version with the IP and browser, once", async () => {
      await service.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      const first = await service.acceptTerms(CARRIER_USER_ID, { accepted: true }, CONTEXT);
      expect(first).toMatchObject({
        profileId: CARRIER_USER_ID,
        version: TOS_VERSION,
        ip: CONTEXT.ip,
        userAgent: CONTEXT.userAgent,
      });
      const again = await service.acceptTerms(CARRIER_USER_ID, { accepted: true }, CONTEXT);
      expect(again.id).toBe(first.id);
      expect(tos.rows).toHaveLength(1);
    });

    it("needs the box checked and the company saved", async () => {
      await service.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      const unchecked = await expectAppError(
        service.acceptTerms(CARRIER_USER_ID, { accepted: false }, CONTEXT),
      );
      expect(unchecked.fieldErrors).toEqual({ accepted: TERMS_MESSAGE });
      carriers.rows.clear();
      const noRow = await expectAppError(
        service.acceptTerms(CARRIER_USER_ID, { accepted: true }, CONTEXT),
      );
      expect(noRow.code).toBe("NOT_FOUND");
      expect(tos.rows).toHaveLength(0);
    });
  });

  describe("joinWaitlist", () => {
    it("stores the yard of an out-of-area carrier, once", async () => {
      await service.createCarrier(CARRIER_USER_ID, validCarrierDetails({ zip: PLACES.dallas.zip }));
      const entry = await service.joinWaitlist(CARRIER_USER_ID);
      expect(entry).toMatchObject({ zip: "75201", lat: PLACES.dallas.lat, lng: PLACES.dallas.lng });
      expect((await service.joinWaitlist(CARRIER_USER_ID)).id).toBe(entry.id);
    });

    it("refuses a carrier who is already in the launch area", async () => {
      await service.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      const error = await expectAppError(service.joinWaitlist(CARRIER_USER_ID));
      expect(error.code).toBe("VALIDATION");
      expect(waitlist.rows.size).toBe(0);
    });
  });

  describe("getAccess: the stage a carrier is at", () => {
    it("starts at onboarding without a row", async () => {
      await expect(service.getAccess(CARRIER_USER_ID)).resolves.toEqual({
        carrier: null,
        termsAccepted: false,
        subscription: null,
        subscribed: false,
        waitlisted: false,
        stage: "onboarding",
      });
    });

    it("then terms, then billing, then ready once a subscription is active", async () => {
      const carrier = await service.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      expect((await service.getAccess(CARRIER_USER_ID)).stage).toBe("terms");

      await service.acceptTerms(CARRIER_USER_ID, { accepted: true }, CONTEXT);
      expect((await service.getAccess(CARRIER_USER_ID)).stage).toBe("billing");

      await subscriptions.upsert({
        ...buildSubscription({ carrierId: carrier.id, status: "past_due" }),
      });
      const lapsed = await service.getAccess(CARRIER_USER_ID);
      expect(lapsed.stage).toBe("billing");
      expect(lapsed.subscribed).toBe(false);
      expect(lapsed.subscription?.status).toBe("past_due");

      await subscriptions.upsert({ ...buildSubscription({ carrierId: carrier.id }) });
      const ready = await service.getAccess(CARRIER_USER_ID);
      expect(ready.stage).toBe("ready");
      expect(ready.subscribed).toBe(true);
      expect(ready.termsAccepted).toBe(true);
    });

    it("sends an out-of-area carrier to the waitlist after the terms, and notes when they joined", async () => {
      await service.createCarrier(CARRIER_USER_ID, validCarrierDetails({ zip: PLACES.dallas.zip }));
      await service.acceptTerms(CARRIER_USER_ID, { accepted: true }, CONTEXT);
      expect((await service.getAccess(CARRIER_USER_ID)).stage).toBe("waitlist");
      expect((await service.getAccess(CARRIER_USER_ID)).waitlisted).toBe(false);
      await service.joinWaitlist(CARRIER_USER_ID);
      expect((await service.getAccess(CARRIER_USER_ID)).waitlisted).toBe(true);

      // The launch reaches Dallas: the same carrier moves on to billing, with no new row.
      areas.setAreas(() => true);
      expect((await service.getAccess(CARRIER_USER_ID)).stage).toBe("billing");
    });

    it("an active subscription keeps access even when an older cancelled one is written later, as the database rules", async () => {
      const carrier = await service.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      await service.acceptTerms(CARRIER_USER_ID, { accepted: true }, CONTEXT);
      await subscriptions.upsert({ ...buildSubscription({ carrierId: carrier.id, stripeSubscriptionId: "sub_old" }) });
      await subscriptions.upsert({ ...buildSubscription({ carrierId: carrier.id, stripeSubscriptionId: "sub_new" }) });
      // A late webhook for the old one, after the new one was stored.
      await subscriptions.upsert({
        ...buildSubscription({ carrierId: carrier.id, stripeSubscriptionId: "sub_old", status: "canceled" }),
      });
      const access = await service.getAccess(CARRIER_USER_ID);
      expect(access.subscribed).toBe(true);
      expect(access.stage).toBe("ready");
      expect(access.subscription?.stripeSubscriptionId).toBe("sub_new");

      // With no access subscription left, the latest one is what the billing page shows.
      await subscriptions.upsert({
        ...buildSubscription({ carrierId: carrier.id, stripeSubscriptionId: "sub_new", status: "past_due" }),
      });
      const lapsed = await service.getAccess(CARRIER_USER_ID);
      expect(lapsed.subscribed).toBe(false);
      expect(lapsed.subscription?.stripeSubscriptionId).toBe("sub_new");
      expect(lapsed.subscription?.status).toBe("past_due");
    });

    it("a trialing subscription grants access like an active one", async () => {
      const carrier = await service.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      await service.acceptTerms(CARRIER_USER_ID, { accepted: true }, CONTEXT);
      await subscriptions.upsert({ ...buildSubscription({ carrierId: carrier.id, status: "trialing" }) });
      expect((await service.getAccess(CARRIER_USER_ID)).stage).toBe("ready");
    });

    it("the stages map to the carrier pages", () => {
      expect(CARRIER_STAGE_PATHS).toEqual({
        onboarding: "/carrier/onboarding",
        terms: "/carrier/terms",
        waitlist: "/carrier/waitlist",
        billing: "/carrier/billing",
        ready: "/carrier/search",
      });
    });
  });
});
