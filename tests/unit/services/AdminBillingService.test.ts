// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { AdminBillingService } from "@/server/services/AdminBillingService";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import type { ShiftFill } from "@/types/domain";
import { FakeCarrierRepository } from "../../fakes/FakeCarrierRepository";
import { FakeFillRepository } from "../../fakes/FakeFillRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { buildCarrier, buildProfile, CARRIER_ID, USER_ID } from "../../setup/factories";

const ADMIN_ID = "a0000000-0000-4000-8000-000000000001";
// Nov 20, noon in Houston: the month began Nov 1 at midnight Houston (05:00 UTC).
const NOW = new Date("2026-11-20T18:00:00.000Z");

const fill = (id: string, charge: ShiftFill["charge"], completedAt: string, carrierId: string | null = CARRIER_ID): ShiftFill => ({
  id,
  shiftId: null,
  carrierId,
  driverId: null,
  shiftStartsAt: completedAt,
  shiftEndsAt: completedAt,
  completedAt,
  charge,
  amountCents: charge === "billable" ? 3500 : 0,
  stripeInvoiceItemId: null,
  billedAt: null,
  waivedAt: null,
  waivedBy: null,
  waiveReason: null,
});

describe("AdminBillingService", () => {
  let fills: FakeFillRepository;
  let audit: AuditEntryInput[];
  let waived: { fillId: string; adminId: string; reason: string }[];
  let service: AdminBillingService;

  beforeEach(() => {
    fills = new FakeFillRepository();
    for (const row of [
      fill("f0000000-0000-4000-8000-000000000001", "billable", "2026-11-01T05:00:00.000Z"),
      fill("f0000000-0000-4000-8000-000000000002", "billable", "2026-11-15T12:00:00.000Z"),
      fill("f0000000-0000-4000-8000-000000000003", "included", "2026-11-03T12:00:00.000Z"),
      fill("f0000000-0000-4000-8000-000000000004", "waived", "2026-11-04T12:00:00.000Z", null),
      // Oct 31, 11:59 PM in Houston: last month.
      fill("f0000000-0000-4000-8000-000000000005", "billable", "2026-11-01T04:59:00.000Z"),
    ]) {
      fills.rows.set(row.id, row);
    }
    audit = [];
    waived = [];
    service = new AdminBillingService(
      new FakeProfileRepository([
        buildProfile({ id: ADMIN_ID, role: "admin", phone: "+15555550102", status: "approved" }),
        buildProfile({ id: USER_ID, role: "carrier" }),
      ]),
      fills,
      new FakeCarrierRepository([buildCarrier({ companyName: "Bayou Freight LLC" })]),
      {
        writeAudit: async (entry) => {
          audit.push(entry);
          return { id: "audit-1", createdAt: NOW.toISOString(), ...entry, detail: entry.detail ?? {} };
        },
      },
      async (fillId, adminId, reason) => {
        waived.push({ fillId, adminId, reason });
        return { fill: { ...fills.rows.get(fillId)!, charge: "waived" }, outcome: "removed" };
      },
      () => NOW,
    );
  });

  it("gives this month's fills in Houston time, with the fill revenue and the carrier names", async () => {
    const page = await service.getFills(ADMIN_ID);
    expect(page).toMatchObject({ since: "2026-11-01T05:00:00.000Z", revenueCents: 7000, billable: 2, included: 1, waived: 1 });
    expect(page.rows.map((row) => [row.fill.id.slice(-1), row.companyName])).toEqual([
      ["2", "Bayou Freight LLC"],
      ["4", null],
      ["3", "Bayou Freight LLC"],
      ["1", "Bayou Freight LLC"],
    ]);
  });

  it("waives a fill with a reason and records it against the carrier", async () => {
    const fillId = "f0000000-0000-4000-8000-000000000002";
    await expect(service.waiveFill(ADMIN_ID, { fillId, reason: "x" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(waived).toEqual([]);

    await expect(service.waiveFill(ADMIN_ID, { fillId, reason: "Driver left at noon" })).resolves.toMatchObject({ outcome: "removed" });
    expect(waived).toEqual([{ fillId, adminId: ADMIN_ID, reason: "Driver left at noon" }]);
    expect(audit).toEqual([
      {
        adminId: ADMIN_ID,
        adminPhone: "+15555550102",
        action: "fill_waived",
        targetType: "carrier",
        targetId: CARRIER_ID,
        detail: { fillId, shiftId: null, amountCents: 3500, reason: "Driver left at noon", outcome: "removed" },
      },
    ]);
  });

  it("is for admins only", async () => {
    await expect(service.getFills(USER_ID)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.waiveFill(USER_ID, { fillId: "f0000000-0000-4000-8000-000000000002", reason: "Because" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(waived).toEqual([]);
  });
});
