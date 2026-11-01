// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import type {
  CarrierReviewRow,
  IAdminOpsRepository,
  Located,
  ServiceAreaInput,
  ShiftAdminRow,
} from "@/server/repositories/AdminOpsRepository";
import { AdminOpsService } from "@/server/services/AdminOpsService";
import type { AccountStatus, Profile, ServiceArea } from "@/types/domain";
import {
  buildCarrier,
  buildDocument,
  buildDriver,
  buildProfile,
  buildSubscription,
  DRIVER_ID,
  USER_ID,
} from "../../setup/factories";
import { FakeDocumentRepository } from "../../fakes/FakeDocumentRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FAKE_AREAS } from "../../fakes/FakeServiceAreaRepository";
import { buildShift } from "../../fakes/FakeShiftRepositories";
import { FakeZipProvider } from "../../fakes/FakeZipProvider";

const ADMIN_ID = "a0000000-0000-4000-8000-0000000000ad";
const NOW = new Date("2026-11-10T18:00:00.000Z");
const C1 = "c1000000-0000-4000-a000-000000000001";
const C2 = "c2000000-0000-4000-a000-000000000002";
const P1 = "e1000000-0000-4000-8000-000000000001";
const P2 = "e2000000-0000-4000-8000-000000000002";

class FakeOps implements IAdminOpsRepository {
  carriers: CarrierReviewRow[] = [];
  shifts: ShiftAdminRow[] = [];
  areas: ServiceArea[] = FAKE_AREAS.map((area, index) => ({ ...area, id: `a${index}000000-0000-4000-8000-000000000000` }));
  drivers: Located[] = [{ lat: 29.7594, lng: -95.3594 }, { lat: 29.7009, lng: -95.1989 }, { lat: 32.7904, lng: -96.8044 }];
  carrierPlaces_: Located[] = [{ lat: 29.7594, lng: -95.3594 }];
  paused = new Map<string, boolean>();
  async listCarriers() {
    return this.carriers;
  }
  async findCarrier(id: string) {
    return this.carriers.find((row) => row.carrier.id === id) ?? null;
  }
  async listShifts() {
    return this.shifts;
  }
  async findShift(id: string) {
    return this.shifts.find((row) => row.shift.id === id) ?? null;
  }
  async listRecipients() {
    return [];
  }
  async listSms() {
    return [];
  }
  async listAreas() {
    return this.areas;
  }
  async createArea(input: ServiceAreaInput) {
    const area = { ...input, id: "a9000000-0000-4000-8000-000000000000" };
    this.areas.push(area);
    return area;
  }
  async updateArea(id: string, input: Partial<ServiceAreaInput>) {
    const index = this.areas.findIndex((area) => area.id === id);
    this.areas[index] = { ...this.areas[index], ...input };
    return this.areas[index];
  }
  async driverPlaces() {
    return this.drivers;
  }
  async carrierPlaces() {
    return this.carrierPlaces_;
  }
  async setShiftsPaused(driverId: string, paused: boolean) {
    this.paused.set(driverId, paused);
  }
  async findDriverByProfile(profileId: string) {
    return profileId === USER_ID ? { id: DRIVER_ID, fullName: "Pat Driver" } : null;
  }
}

describe("AdminOpsService", () => {
  let ops: FakeOps;
  let profiles: FakeProfileRepository;
  let documents: FakeDocumentRepository;
  let audit: AuditEntryInput[];
  let deleted: string[];
  let cancelled: string[];
  let statuses: { profileId: string; status: AccountStatus }[];
  let service: AdminOpsService;
  let driverRow = { driver: buildDriver({ shiftsPaused: false, noShowCount: 2 }), profile: buildProfile() };

  beforeEach(() => {
    ops = new FakeOps();
    const carrierProfile = (id: string, status: AccountStatus) => buildProfile({ id, role: "carrier", phone: `+1555555${id.slice(1, 5).replace(/\D/g, "1")}`, status });
    ops.carriers = [
      { carrier: buildCarrier({ id: C1, profileId: P1, companyName: "Paid Freight" }), profile: carrierProfile(P1, "approved"), subscriptions: [buildSubscription({ carrierId: C1, status: "active" })] },
      { carrier: buildCarrier({ id: C2, profileId: P2, companyName: "Dallas Freight", lat: 32.7904, lng: -96.8044 }), profile: carrierProfile(P2, "pending"), subscriptions: [buildSubscription({ carrierId: C2, status: "canceled" })] },
    ];
    profiles = new FakeProfileRepository([
      buildProfile({ id: ADMIN_ID, role: "admin", phone: "+15555550102", status: "approved" }),
      buildProfile({ id: USER_ID, role: "driver" }),
      ...ops.carriers.map((row) => row.profile),
    ]);
    documents = new FakeDocumentRepository();
    audit = [];
    deleted = [];
    cancelled = [];
    statuses = [];
    driverRow = { driver: buildDriver({ shiftsPaused: false, noShowCount: 2 }), profile: buildProfile() };
    service = new AdminOpsService(
      ops,
      {
        writeAudit: async (entry) => {
          audit.push(entry);
          return { ...entry, id: "x", detail: entry.detail ?? {}, createdAt: NOW.toISOString() };
        },
        listAudit: async () => [],
        setProfileStatus: async (profileId, status): Promise<Profile> => {
          statuses.push({ profileId, status });
          return { ...profiles.rows.get(profileId)!, status };
        },
        findDriver: async (id) => (id === DRIVER_ID ? driverRow : null),
      },
      profiles,
      documents,
      new FakeZipProvider([{ zip: "77002", city: "Houston", state: "TX", lat: 29.7594, lng: -95.3594 }]),
      () => ({ deleteUser: async (id: string) => void deleted.push(id) }),
      async (id) => void cancelled.push(id),
      () => NOW,
    );
  });

  it("is for admins only", async () => {
    await expect(service.getCarriersPage(USER_ID, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.getSubscriptions(P1)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.createArea(USER_ID, { name: "X", centerZip: "77002", radiusMiles: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists carriers with their access and area, and filters them", async () => {
    const page = await service.getCarriersPage(ADMIN_ID, {});
    expect(page.tiles).toEqual({ total: 2, subscribed: 1, unpaid: 1, blocked: 0 });
    expect(page.rows.map((row) => [row.carrier.companyName, row.subscribed, row.inServiceArea])).toEqual([
      ["Paid Freight", true, true],
      ["Dallas Freight", false, false],
    ]);
    expect((await service.getCarriersPage(ADMIN_ID, { status: "subscribed" })).rows).toHaveLength(1);
    expect((await service.getCarriersPage(ADMIN_ID, { status: "nonsense" })).query.status).toBe("");
  });

  it("filters unpaid and blocked carriers, and opens one with its shifts", async () => {
    expect((await service.getCarriersPage(ADMIN_ID, { status: "unpaid" })).rows.map((row) => row.carrier.id)).toEqual([C2]);
    expect((await service.getCarriersPage(ADMIN_ID, { status: "blocked" })).rows).toEqual([]);
    ops.shifts = [{ shift: buildShift({ carrierId: C1 }), companyName: "Paid Freight" }];
    const detail = await service.getCarrier(ADMIN_ID, { carrierId: C1 });
    expect(detail).toMatchObject({ subscribed: true, inServiceArea: true });
    expect(detail.shifts).toHaveLength(1);
    expect((await service.getCarrier(ADMIN_ID, { carrierId: C2 })).shifts).toEqual([]);
    await expect(service.getCarrier(ADMIN_ID, { carrierId: "c9000000-0000-4000-a000-000000000009" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.getShift(ADMIN_ID, { shiftId: "50000000-0000-4000-8000-000000000009" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses to edit an area that does not exist or move it to an unknown ZIP", async () => {
    await expect(
      service.updateArea(ADMIN_ID, { areaId: "a9900000-0000-4000-8000-000000000000", name: "X area", centerZip: "77002", radiusMiles: 10 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.createArea(ADMIN_ID, { name: "Nowhere", centerZip: "99999", radiusMiles: 10 })).rejects.toMatchObject({
      fieldErrors: { centerZip: expect.any(String) },
    });
    expect(await service.getAreaHistory(ADMIN_ID, ops.areas[0].id)).toEqual([]);
    await expect(service.setDriverPaused(ADMIN_ID, { driverId: "dd000000-0000-4000-8000-000000000000" }, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("approves, blocks and reopens a carrier, audited, and does nothing when unchanged", async () => {
    await service.blockCarrier(ADMIN_ID, { carrierId: C1 });
    await service.approveCarrier(ADMIN_ID, { carrierId: C1 });
    expect(statuses).toEqual([{ profileId: P1, status: "blocked" }]);
    expect(audit.map((entry) => [entry.action, entry.targetType, entry.targetId])).toEqual([["carrier_blocked", "carrier", C1]]);
    await service.reopenCarrier(ADMIN_ID, { carrierId: C2 }).catch(() => undefined);
    await expect(service.approveCarrier(ADMIN_ID, { carrierId: "c9000000-0000-4000-a000-000000000009" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("removes a carrier after cancelling their billing, and a driver after their files, audited before the delete", async () => {
    await expect(service.removeAccount(ADMIN_ID, { profileId: P1 })).rejects.toMatchObject({ code: "VALIDATION" });
    await service.removeAccount(ADMIN_ID, { profileId: P1, confirm: "REMOVE" });
    expect(cancelled).toEqual([P1]);
    expect(deleted).toEqual([P1]);
    expect(audit.at(-1)).toMatchObject({ action: "carrier_removed", targetId: C1, detail: { name: "Paid Freight" } });

    const doc = buildDocument();
    documents.rows.set(doc.id, doc);
    documents.files.set(doc.storagePath, { size: 1, mimeType: "image/jpeg" } as never);
    await service.removeAccount(ADMIN_ID, { profileId: USER_ID, confirm: "REMOVE" });
    expect(documents.files.has(doc.storagePath)).toBe(false);
    expect(deleted).toEqual([P1, USER_ID]);
    expect(audit.at(-1)).toMatchObject({ action: "driver_removed", targetType: "driver", targetId: DRIVER_ID });

    await expect(service.removeAccount(ADMIN_ID, { profileId: ADMIN_ID, confirm: "REMOVE" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("pauses and unpauses a driver's shift texts, audited with the no-shows", async () => {
    await service.setDriverPaused(ADMIN_ID, { driverId: DRIVER_ID }, true);
    expect(ops.paused.get(DRIVER_ID)).toBe(true);
    expect(audit.at(-1)).toMatchObject({ action: "driver_paused", detail: { noShows: 2 } });
    driverRow = { ...driverRow, driver: { ...driverRow.driver, shiftsPaused: true } };
    await service.setDriverPaused(ADMIN_ID, { driverId: DRIVER_ID }, true);
    expect(audit).toHaveLength(1);
    await service.setDriverPaused(ADMIN_ID, { driverId: DRIVER_ID }, false);
    expect(audit.at(-1)?.action).toBe("driver_unpaused");
  });

  it("counts active subscriptions and the monthly revenue", async () => {
    const page = await service.getSubscriptions(ADMIN_ID);
    expect(page).toMatchObject({ active: 1, mrr: 399 });
    expect(page.rows.map((row) => row.companyName).sort()).toEqual(["Dallas Freight", "Paid Freight"]);
  });

  it("lists shifts with expired shown as expired, the fill rate, and the filter", async () => {
    ops.shifts = [
      { shift: buildShift({ id: "50000000-0000-4000-8000-000000000001", status: "booked", bookedDriverId: DRIVER_ID, bookedAt: NOW.toISOString() }), companyName: "Paid Freight" },
      { shift: buildShift({ id: "50000000-0000-4000-8000-000000000002", startsAt: "2026-11-09T12:00:00.000Z", endsAt: "2026-11-09T20:00:00.000Z" }), companyName: "Paid Freight" },
      { shift: buildShift({ id: "50000000-0000-4000-8000-000000000003", startsAt: "2026-11-20T12:00:00.000Z", endsAt: "2026-11-20T20:00:00.000Z" }), companyName: "Paid Freight" },
    ];
    const page = await service.getShiftsPage(ADMIN_ID, {});
    expect(page.rows.map((row) => row.status)).toEqual(["booked", "expired", "open"]);
    expect(page.tiles).toEqual({ total: 3, open: 1, booked: 1, fillRate: 50 });
    expect((await service.getShiftsPage(ADMIN_ID, { status: "expired" })).rows).toHaveLength(1);
    expect((await service.getShift(ADMIN_ID, { shiftId: "50000000-0000-4000-8000-000000000001" })).companyName).toBe("Paid Freight");
  });

  it("counts drivers and carriers inside each area and previews a new one", async () => {
    const areas = await service.getAreas(ADMIN_ID);
    expect(areas.map((row) => [row.area.name, row.drivers, row.carriers])).toEqual([
      ["Houston", 2, 1],
      ["Pasadena", 2, 1],
    ]);
    expect(await service.previewArea(ADMIN_ID, { centerZip: "77002", radiusMiles: 5 })).toEqual({
      city: "Houston",
      state: "TX",
      lat: 29.7594,
      lng: -95.3594,
      drivers: 1,
      carriers: 1,
    });
    await expect(service.previewArea(ADMIN_ID, { centerZip: "99999", radiusMiles: 5 })).rejects.toMatchObject({
      fieldErrors: { centerZip: expect.any(String) },
    });
    await expect(service.previewArea(ADMIN_ID, { centerZip: "77002", radiusMiles: 300 })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("adds, edits, deactivates and activates an area, each change audited with who", async () => {
    const area = await service.createArea(ADMIN_ID, { name: "Downtown", centerZip: "77002", radiusMiles: 20 });
    expect(area).toMatchObject({ centerLat: 29.7594, centerLng: -95.3594, isActive: true });
    await service.updateArea(ADMIN_ID, { areaId: area.id, name: "Downtown Houston", centerZip: "77002", radiusMiles: 30 });
    await service.setAreaActive(ADMIN_ID, { areaId: area.id, isActive: false });
    await service.setAreaActive(ADMIN_ID, { areaId: area.id, isActive: true });
    expect(audit.map((entry) => entry.action)).toEqual([
      "service_area_created",
      "service_area_updated",
      "service_area_deactivated",
      "service_area_activated",
    ]);
    expect(audit.every((entry) => entry.adminId === ADMIN_ID && entry.adminPhone === "+15555550102")).toBe(true);
    expect(audit[1].detail).toMatchObject({ from: { radiusMiles: 20 }, to: { radiusMiles: 30, name: "Downtown Houston" } });
  });

  it("gives the analytics tiles for carriers, revenue and shifts", async () => {
    ops.shifts = [
      { shift: buildShift({ status: "booked", bookedDriverId: DRIVER_ID, bookedAt: NOW.toISOString(), createdAt: "2026-11-05T00:00:00.000Z" }), companyName: "Paid Freight" },
      { shift: buildShift({ createdAt: "2026-09-01T00:00:00.000Z" }), companyName: "Paid Freight" },
    ];
    expect(await service.getOpsTiles(ADMIN_ID)).toEqual({
      carriers: 2,
      subscribed: 1,
      mrr: 399,
      shifts30d: 1,
      booked30d: 1,
      fillRate30d: 100,
    });
  });
});
