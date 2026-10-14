// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { SEARCH_PAGE_SIZE } from "@/lib/constants";
import { AppError } from "@/server/errors/AppError";
import { CarrierService } from "@/server/services/CarrierService";
import { DriverSearchService } from "@/server/services/DriverSearchService";
import type { Driver } from "@/types/domain";
import { FakeCarrierRepository } from "../../fakes/FakeCarrierRepository";
import { FakeDocumentRepository } from "../../fakes/FakeDocumentRepository";
import { FakeDriverSearchRepository } from "../../fakes/FakeDriverSearchRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeServiceAreaRepository } from "../../fakes/FakeServiceAreaRepository";
import { FakeSubscriptionRepository } from "../../fakes/FakeSubscriptionRepository";
import { FakeTosRepository } from "../../fakes/FakeTosRepository";
import { FakeWaitlistRepository } from "../../fakes/FakeWaitlistRepository";
import { FakeZipProvider } from "../../fakes/FakeZipProvider";
import {
  buildCarrierProfile,
  buildDocument,
  buildDriver,
  buildSubscription,
  CARRIER_USER_ID,
  PLACES,
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

const id = (n: number) => `d${String(n).padStart(7, "0")}-0000-4000-8000-000000000000`;

/** A listed card near Houston. */
const listed = (n: number, overrides: Partial<Driver> = {}): Driver =>
  buildDriver({
    id: id(n),
    profileId: `p${String(n).padStart(7, "0")}-0000-4000-8000-000000000000`,
    fullName: `Driver ${n}`,
    city: PLACES.houston.city,
    state: PLACES.houston.state,
    zip: PLACES.houston.zip,
    lat: PLACES.houston.lat,
    lng: PLACES.houston.lng,
    ...overrides,
  });

describe("DriverSearchService", () => {
  let search: FakeDriverSearchRepository;
  let documents: FakeDocumentRepository;
  let subscriptions: FakeSubscriptionRepository;
  let carrierService: CarrierService;
  let service: DriverSearchService;

  beforeEach(() => {
    search = new FakeDriverSearchRepository();
    documents = new FakeDocumentRepository();
    subscriptions = new FakeSubscriptionRepository();
    carrierService = new CarrierService(
      new FakeCarrierRepository(),
      new FakeProfileRepository([buildCarrierProfile()]),
      new FakeZipProvider(Object.values(PLACES)),
      new FakeServiceAreaRepository(),
      new FakeTosRepository(),
      new FakeWaitlistRepository(),
      subscriptions,
    );
    service = new DriverSearchService(carrierService, search, documents);
  });

  async function subscribedCarrier() {
    const carrier = await carrierService.createCarrier(CARRIER_USER_ID, validCarrierDetails());
    await subscriptions.upsert({ ...buildSubscription({ carrierId: carrier.id }) });
    return carrier;
  }

  describe("access", () => {
    it("needs the company saved and an active subscription", async () => {
      expect((await expectAppError(service.search(CARRIER_USER_ID, {}))).code).toBe("NOT_FOUND");
      const carrier = await carrierService.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      expect((await expectAppError(service.search(CARRIER_USER_ID, {}))).code).toBe("FORBIDDEN");
      await subscriptions.upsert({ ...buildSubscription({ carrierId: carrier.id, status: "unpaid" }) });
      expect((await expectAppError(service.getDriver(CARRIER_USER_ID, { driverId: id(1) }))).code).toBe(
        "FORBIDDEN",
      );
      expect(
        (await expectAppError(service.getDocumentUrl(CARRIER_USER_ID, { documentId: id(1) }))).code,
      ).toBe("FORBIDDEN");
      expect(search.searches).toHaveLength(0);
    });
  });

  describe("search", () => {
    it("searches from the yard with the defaults and pages the results", async () => {
      await subscribedCarrier();
      for (let n = 1; n <= 25; n += 1) search.listed.set(id(n), listed(n));

      const page1 = await service.search(CARRIER_USER_ID, {});
      expect(page1).toMatchObject({ total: 25, page: 1, pageSize: SEARCH_PAGE_SIZE, pageCount: 2 });
      expect(page1.matches).toHaveLength(SEARCH_PAGE_SIZE);
      expect(page1.matches[0]).toEqual({ driver: listed(1), distanceMiles: 0 });
      expect(page1.filters.radiusMiles).toBe(50);
      expect(search.searches[0]).toMatchObject({
        lat: PLACES.houston.lat,
        lng: PLACES.houston.lng,
        radiusMiles: 50,
        endorsements: [],
        equipmentTypes: [],
        limit: SEARCH_PAGE_SIZE,
        offset: 0,
      });

      const page2 = await service.search(CARRIER_USER_ID, { page: "2" });
      expect(page2.matches).toHaveLength(5);
      expect(page2.page).toBe(2);
      expect(search.searches[1].offset).toBe(SEARCH_PAGE_SIZE);
    });

    it("passes the filters through and reports them back with the defaults filled in", async () => {
      await subscribedCarrier();
      search.listed.set(id(1), listed(1, { cdlClass: "A", endorsements: ["H", "N", "X"], yearsExperience: 10 }));
      search.listed.set(id(2), listed(2, { cdlClass: "B", endorsements: [], yearsExperience: 1, twicActive: false }));
      search.listed.set(id(3), listed(3, { lat: PLACES.dallas.lat, lng: PLACES.dallas.lng }));

      const page = await service.search(CARRIER_USER_ID, {
        radiusMiles: "25",
        cdlClass: "A",
        endorsements: ["H"],
        minYears: "5",
        twicActive: "true",
        manualOnly: "true",
        mvrMax: "clean",
      });
      expect(page.matches.map((match) => match.driver.id)).toEqual([id(1)]);
      expect(page.filters).toEqual({
        radiusMiles: 25,
        cdlClass: "A",
        endorsements: ["H"],
        minYears: 5,
        twicActive: true,
        medicalCardActive: undefined,
        manualOnly: true,
        equipmentTypes: [],
        mvrMax: "clean",
        page: 1,
      });
      expect(search.searches[0]).toMatchObject({ cdlClass: "A", minYears: 5, twicActive: true, manualOnly: true, mvrMax: "clean" });
    });

    it("rejects a bad filter with a field error", async () => {
      await subscribedCarrier();
      const error = await expectAppError(service.search(CARRIER_USER_ID, { radiusMiles: "1000" }));
      expect(error.fieldErrors).toHaveProperty("radiusMiles");
    });

    it("is empty, not an error, when nothing matches", async () => {
      await subscribedCarrier();
      const page = await service.search(CARRIER_USER_ID, {});
      expect(page).toMatchObject({ matches: [], total: 0, page: 1, pageCount: 1 });
    });
  });

  describe("getDriver", () => {
    it("returns the card, the distance from the yard and the papers", async () => {
      await subscribedCarrier();
      const driver = listed(1, { lat: PLACES.pasadena.lat, lng: PLACES.pasadena.lng });
      search.listed.set(driver.id, driver);
      const document = buildDocument({ driverId: driver.id });
      documents.rows.set(document.id, document);

      await expect(service.getDriver(CARRIER_USER_ID, { driverId: driver.id })).resolves.toEqual({
        driver,
        distanceMiles: 10.4,
        documents: [document],
      });
    });

    it("reads a card that is not listed as not found, and checks the id", async () => {
      await subscribedCarrier();
      expect((await expectAppError(service.getDriver(CARRIER_USER_ID, { driverId: id(9) }))).code).toBe(
        "NOT_FOUND",
      );
      const bad = await expectAppError(service.getDriver(CARRIER_USER_ID, { driverId: "nope" }));
      expect(bad.code).toBe("VALIDATION");
    });

    it("treats a card without coordinates as not found", async () => {
      await subscribedCarrier();
      search.listed.set(id(1), listed(1, { lat: null, lng: null }));
      expect((await expectAppError(service.getDriver(CARRIER_USER_ID, { driverId: id(1) }))).code).toBe(
        "NOT_FOUND",
      );
    });
  });

  describe("getDocumentUrl", () => {
    it("makes a short-lived link to a listed driver's file", async () => {
      await subscribedCarrier();
      const document = buildDocument({ storagePath: `${id(1)}/cdl.jpg` });
      documents.rows.set(document.id, document);
      documents.files.set(document.storagePath, { sizeBytes: 10, mimeType: "image/jpeg" });
      await expect(service.getDocumentUrl(CARRIER_USER_ID, { documentId: document.id })).resolves.toBe(
        `https://storage.test/${id(1)}/cdl.jpg?expires=60`,
      );
    });

    it("answers not found for a document the carrier cannot see", async () => {
      await subscribedCarrier();
      const error = await expectAppError(
        service.getDocumentUrl(CARRIER_USER_ID, { documentId: "d0000000-0000-4000-8000-000000000009" }),
      );
      expect(error.code).toBe("NOT_FOUND");
    });
  });
});
