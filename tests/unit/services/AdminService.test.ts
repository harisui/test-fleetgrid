// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN_PAGE_SIZE } from "@/lib/constants";
import { AppError } from "@/server/errors/AppError";
import type { DriverReviewRow } from "@/server/repositories/AdminRepository";
import { AdminService } from "@/server/services/AdminService";
import { FakeAdminRepository } from "../../fakes/FakeAdminRepository";
import { FakeDocumentRepository } from "../../fakes/FakeDocumentRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeServiceAreaRepository } from "../../fakes/FakeServiceAreaRepository";
import {
  buildDocument,
  buildDriver,
  buildProfile,
  CARRIER_USER_ID,
  OTHER_USER_ID,
  PLACES,
  USER_ID,
} from "../../setup/factories";

const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_PHONE = "+15555550102";
const THIRD_USER_ID = "55555555-5555-4555-8555-555555555555";
const D1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const D2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const D3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
/** No such driver. */
const D9 = "99999999-9999-4999-8999-999999999999";
/** A Tuesday, 10:00 in Houston (15:00 UTC). */
const NOW = new Date("2026-10-27T15:00:00.000Z");

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("AdminService", () => {
  let admin: FakeAdminRepository;
  let profiles: FakeProfileRepository;
  let documents: FakeDocumentRepository;
  let service: AdminService;

  const pending = buildProfile({ id: USER_ID, status: "pending" });
  const approved = buildProfile({ id: OTHER_USER_ID, phone: "+15555550108", status: "approved" });
  const lead = buildProfile({ id: THIRD_USER_ID, phone: "+15555550109", status: "pending" });

  const rows = (): DriverReviewRow[] => [
    {
      driver: buildDriver({
        id: D1,
        profileId: USER_ID,
        fullName: "Pat Driver",
        city: PLACES.houston.city,
        zip: PLACES.houston.zip,
        lat: PLACES.houston.lat,
        lng: PLACES.houston.lng,
        createdAt: "2026-10-27T14:00:00.000Z", // today, 9:00 Houston
      }),
      profile: pending,
    },
    {
      driver: buildDriver({
        id: D2,
        profileId: OTHER_USER_ID,
        fullName: "Dallas Driver",
        city: PLACES.dallas.city,
        zip: PLACES.dallas.zip,
        lat: PLACES.dallas.lat,
        lng: PLACES.dallas.lng,
        createdAt: "2026-10-26T20:00:00.000Z", // Monday afternoon Houston: this week, not today
      }),
      profile: approved,
    },
    {
      // A lead: name only, no ZIP yet, card not finished.
      driver: buildDriver({
        id: D3,
        profileId: THIRD_USER_ID,
        fullName: "Lee Lead",
        zip: null,
        city: null,
        lat: null,
        lng: null,
        cardCompleted: false,
        smsOptIn: false,
        createdAt: "2026-10-20T12:00:00.000Z", // last week
      }),
      profile: lead,
    },
  ];

  beforeEach(() => {
    profiles = new FakeProfileRepository([
      buildProfile({ id: ADMIN_ID, role: "admin", phone: ADMIN_PHONE, status: "approved" }),
      buildProfile({ id: CARRIER_USER_ID, role: "carrier", phone: "+15555550101" }),
      pending,
      approved,
      lead,
    ]);
    admin = new FakeAdminRepository(rows(), profiles);
    documents = new FakeDocumentRepository();
    service = new AdminService(admin, profiles, new FakeServiceAreaRepository(), documents, () => NOW);
  });

  it("is for admins only", async () => {
    for (const who of [USER_ID, CARRIER_USER_ID, "nobody"]) {
      expect((await expectAppError(service.getDriversPage(who, {}))).code).toBe("FORBIDDEN");
      expect((await expectAppError(service.getDriver(who, { driverId: D1 }))).code).toBe("FORBIDDEN");
      expect((await expectAppError(service.approveDriver(who, { driverId: D1 }))).code).toBe("FORBIDDEN");
      expect((await expectAppError(service.getDocumentUrl(who, { documentId: "x" }))).code).toBe("FORBIDDEN");
    }
    expect(admin.statusChanges).toEqual([]);
    expect(admin.audit).toEqual([]);
  });

  describe("getDriversPage", () => {
    it("counts the tiles over every driver, with today and this week in Houston time", async () => {
      const page = await service.getDriversPage(ADMIN_ID, {});
      expect(page.tiles).toEqual({
        total: 3,
        pending: 2,
        approved: 1,
        blocked: 0,
        incomplete: 1,
        today: 1,
        thisWeek: 2,
      });
    });

    it("lists newest first with the area and the card state, and reports the query it applied", async () => {
      const page = await service.getDriversPage(ADMIN_ID, {});
      expect(page.rows.map((row) => [row.driver.fullName, row.inServiceArea, row.complete])).toEqual([
        ["Pat Driver", true, true],
        ["Dallas Driver", false, true],
        ["Lee Lead", null, false],
      ]);
      expect(page).toMatchObject({ total: 3, page: 1, pageSize: ADMIN_PAGE_SIZE });
      expect(page.query).toEqual({
        status: "",
        complete: "",
        area: "",
        q: "",
        sort: "created",
        dir: "desc",
        page: 1,
        open: undefined,
      });
    });

    it("filters by review status, card state and area", async () => {
      const names = async (input: Record<string, string>) =>
        (await service.getDriversPage(ADMIN_ID, input)).rows.map((row) => row.driver.fullName);
      expect(await names({ status: "pending" })).toEqual(["Pat Driver", "Lee Lead"]);
      expect(await names({ status: "approved" })).toEqual(["Dallas Driver"]);
      expect(await names({ status: "blocked" })).toEqual([]);
      expect(await names({ complete: "incomplete" })).toEqual(["Lee Lead"]);
      expect(await names({ complete: "complete" })).toEqual(["Pat Driver", "Dallas Driver"]);
      expect(await names({ area: "in" })).toEqual(["Pat Driver"]);
      expect(await names({ area: "out" })).toEqual(["Dallas Driver"]);
      expect(await names({ status: "pending", complete: "complete", area: "in" })).toEqual(["Pat Driver"]);
    });

    it("searches by name, by phone digits and by ZIP", async () => {
      const names = async (q: string) =>
        (await service.getDriversPage(ADMIN_ID, { q })).rows.map((row) => row.driver.fullName);
      expect(await names("pat")).toEqual(["Pat Driver"]);
      expect(await names("DRIVER")).toEqual(["Pat Driver", "Dallas Driver"]);
      expect(await names("(555) 555-0108")).toEqual(["Dallas Driver"]);
      expect(await names("0109")).toEqual(["Lee Lead"]);
      expect(await names("752")).toEqual(["Dallas Driver"]);
      expect(await names("nobody")).toEqual([]);
    });

    it("sorts by name or status in either direction, and pages", async () => {
      const names = async (input: Record<string, string>) =>
        (await service.getDriversPage(ADMIN_ID, input)).rows.map((row) => row.driver.fullName);
      expect(await names({ sort: "name", dir: "asc" })).toEqual(["Dallas Driver", "Lee Lead", "Pat Driver"]);
      expect(await names({ sort: "name", dir: "desc" })).toEqual(["Pat Driver", "Lee Lead", "Dallas Driver"]);
      expect(await names({ sort: "status", dir: "asc" })).toEqual(["Pat Driver", "Lee Lead", "Dallas Driver"]);
      expect(await names({ sort: "created", dir: "asc" })).toEqual(["Lee Lead", "Dallas Driver", "Pat Driver"]);

      for (let n = 0; n < ADMIN_PAGE_SIZE; n += 1) {
        admin.rows.push({
          driver: buildDriver({ id: `x${n}`, profileId: `p${n}`, fullName: `Extra ${n}`, createdAt: `2026-09-01T00:00:${String(n).padStart(2, "0")}.000Z` }),
          profile: buildProfile({ id: `p${n}`, phone: `+1555555${String(1000 + n)}` }),
        });
      }
      const first = await service.getDriversPage(ADMIN_ID, {});
      expect(first.rows).toHaveLength(ADMIN_PAGE_SIZE);
      expect(first.total).toBe(ADMIN_PAGE_SIZE + 3);
      const second = await service.getDriversPage(ADMIN_ID, { page: "2" });
      expect(second.rows).toHaveLength(3);
      expect(second.page).toBe(2);
      // Past the end lands on the last page, unknown filter values fall back quietly.
      const beyond = await service.getDriversPage(ADMIN_ID, { page: "9", status: "weird", sort: "nope" });
      expect(beyond.page).toBe(2);
      expect(beyond.query).toMatchObject({ status: "", sort: "created" });
    });
  });

  describe("getDriver", () => {
    it("returns the driver with the area, the papers and the history", async () => {
      const document = buildDocument({ driverId: D1 });
      documents.rows.set(document.id, document);
      await service.approveDriver(ADMIN_ID, { driverId: D1 });

      const detail = await service.getDriver(ADMIN_ID, { driverId: D1 });
      expect(detail.driver.fullName).toBe("Pat Driver");
      expect(detail.inServiceArea).toBe(true);
      expect(detail.complete).toBe(true);
      expect(detail.documents).toEqual([document]);
      expect(detail.history).toHaveLength(1);
      expect(detail.history[0]).toMatchObject({
        action: "driver_approved",
        adminId: ADMIN_ID,
        adminPhone: ADMIN_PHONE,
        targetType: "driver",
        targetId: D1,
        detail: { from: "pending", to: "approved", name: "Pat Driver" },
      });
    });

    it("answers not found for an unknown driver and refuses a bad id", async () => {
      expect((await expectAppError(service.getDriver(ADMIN_ID, { driverId: D9 }))).code).toBe("NOT_FOUND");
      const bad = await expectAppError(service.getDriver(ADMIN_ID, { driverId: "" }));
      expect(bad.fieldErrors).toEqual({ driverId: "Driver not found" });
    });
  });

  describe("status changes", () => {
    it("approves, blocks and reopens, writing the audit log each time", async () => {
      expect((await service.approveDriver(ADMIN_ID, { driverId: D1 })).status).toBe("approved");
      expect((await service.blockDriver(ADMIN_ID, { driverId: D1 })).status).toBe("blocked");
      expect((await service.reopenDriver(ADMIN_ID, { driverId: D1 })).status).toBe("pending");
      expect(admin.statusChanges.map((change) => change.status)).toEqual(["approved", "blocked", "pending"]);
      expect(admin.audit.map((entry) => [entry.action, entry.detail.from, entry.detail.to])).toEqual([
        ["driver_approved", "pending", "approved"],
        ["driver_blocked", "approved", "blocked"],
        ["driver_reopened", "blocked", "pending"],
      ]);
      expect(profiles.rows.get(USER_ID)?.status).toBe("pending");
    });

    it("does nothing, and logs nothing, when the status is already so", async () => {
      const same = await service.approveDriver(ADMIN_ID, { driverId: D2 });
      expect(same.status).toBe("approved");
      expect(admin.statusChanges).toEqual([]);
      expect(admin.audit).toEqual([]);
    });

    it("refuses to approve a driver whose card is not finished, with the reason", async () => {
      const error = await expectAppError(service.approveDriver(ADMIN_ID, { driverId: D3 }));
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toBe("This driver has not finished their card, so they cannot be approved yet.");
      expect(admin.statusChanges).toEqual([]);
      // Blocking an unfinished card is allowed: a bot can be stopped at once.
      expect((await service.blockDriver(ADMIN_ID, { driverId: D3 })).status).toBe("blocked");
    });

    it("refuses an unknown driver and a bad id", async () => {
      expect((await expectAppError(service.blockDriver(ADMIN_ID, { driverId: D9 }))).code).toBe("NOT_FOUND");
      const bad = await expectAppError(service.approveDriver(ADMIN_ID, { driverId: "x" }));
      expect(bad.fieldErrors).toEqual({ driverId: "Driver not found" });
    });
  });

  describe("getDocumentUrl", () => {
    it("makes a short-lived link to a driver's file", async () => {
      const document = buildDocument({ driverId: D1, storagePath: "d1/cdl.jpg" });
      documents.rows.set(document.id, document);
      documents.files.set(document.storagePath, { sizeBytes: 10, mimeType: "image/jpeg" });
      await expect(service.getDocumentUrl(ADMIN_ID, { documentId: document.id })).resolves.toBe(
        "https://storage.test/d1/cdl.jpg?expires=60",
      );
    });

    it("answers not found for an unknown document", async () => {
      expect(
        (await expectAppError(service.getDocumentUrl(ADMIN_ID, { documentId: "d0000000-0000-4000-8000-000000000009" }))).code,
      ).toBe("NOT_FOUND");
    });
  });
});
