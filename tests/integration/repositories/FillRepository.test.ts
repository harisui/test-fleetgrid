import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FillRepository } from "@/server/repositories/FillRepository";
import { ShiftRepository } from "@/server/repositories/ShiftRepository";
import type { Shift } from "@/types/domain";
import {
  cleanupTestUsers,
  createListedDriver,
  createTestCarrier,
  serviceClient,
  TEST_PLACES,
  type TestCarrier,
  type TestDriver,
} from "../../setup/supabase";

const HOUR = 60 * 60 * 1000;

/** Completed fills through the real database (0039): the job's function, billing stamps, RLS. */
describe("FillRepository", () => {
  let carrier: TestCarrier;
  let other: TestCarrier;
  let driver: TestDriver;
  let shift: Shift;
  const admin = () => serviceClient();

  beforeAll(async () => {
    carrier = await createTestCarrier({ subscription: "active" });
    other = await createTestCarrier({ subscription: "active" });
    driver = await createListedDriver({ fullName: "Fill Driver", place: TEST_PLACES.pasadena });
    const start = new Date(Date.now() + 24 * HOUR);
    shift = await new ShiftRepository(carrier.client).create(carrier.carrierId, {
      ...TEST_PLACES.pasadena,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 8 * HOUR).toISOString(),
      cdlClass: "A",
      endorsements: [],
      minYears: 0,
      equipmentTypes: [],
      twicRequired: false,
      medicalRequired: false,
      manualRequired: false,
      payText: null,
      workDescription: "Yard moves for the fill check.",
      onsiteContactName: "Lee Yard",
      onsiteContactPhone: "+17135550100",
      sendAfter: null,
    });
    // Booked, then over 2 hours ago: a completed fill.
    const { error } = await admin()
      .from("shifts")
      .update({
        status: "booked",
        booked_driver_id: driver.driverId,
        booked_at: new Date().toISOString(),
        starts_at: new Date(Date.now() - 12 * HOUR).toISOString(),
        ends_at: new Date(Date.now() - 3 * HOUR).toISOString(),
      })
      .eq("id", shift.id);
    expect(error).toBeNull();
  });

  afterAll(cleanupTestUsers);

  it("records the completed fill once, maps it, and stamps its invoice item", async () => {
    const fills = new FillRepository(admin());
    const recorded = (await fills.recordCompleted(3500, 3)).filter((fill) => fill.shiftId === shift.id);
    expect(recorded).toEqual([
      expect.objectContaining({
        carrierId: carrier.carrierId,
        driverId: driver.driverId,
        charge: "billable",
        amountCents: 3500,
        stripeInvoiceItemId: null,
        billedAt: null,
      }),
    ]);
    const [fill] = recorded;
    if (!fill) throw new Error("no fill");
    expect(Date.parse(fill.completedAt)).toBe(Date.parse(fill.shiftEndsAt) + 2 * HOUR);
    expect((await fills.recordCompleted(3500, 3)).some((row) => row.shiftId === shift.id)).toBe(false);

    expect((await fills.listUnbilled(carrier.carrierId)).map((row) => row.id)).toEqual([fill.id]);
    // Fills outlive their shifts (billing records), so each run uses its own item id.
    const itemId = `ii_integration_${randomUUID().slice(0, 8)}`;
    const billed = await fills.markBilled(fill.id, itemId, new Date().toISOString());
    expect(billed.stripeInvoiceItemId).toBe(itemId);
    expect(await fills.listUnbilled(carrier.carrierId)).toEqual([]);
  });

  it("lets a carrier read only its own fills", async () => {
    expect(await new FillRepository(carrier.client).listForCarrier(carrier.carrierId, null)).toHaveLength(1);
    expect(await new FillRepository(other.client).listForCarrier(carrier.carrierId, null)).toEqual([]);
  });

  it("refuses a carrier running the job", async () => {
    await expect(new FillRepository(carrier.client).recordCompleted(0, 3)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
