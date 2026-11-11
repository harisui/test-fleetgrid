// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { FILL_FEE_CENTS } from "@/lib/constants";
import { TestPaymentProvider } from "@/server/providers/TestPaymentProvider";
import { fillChargeDescription, FillService } from "@/server/services/FillService";
import type { ShiftFill } from "@/types/domain";
import { FakeCarrierRepository } from "../../fakes/FakeCarrierRepository";
import { FakeFillRepository } from "../../fakes/FakeFillRepository";
import { FakeSubscriptionRepository } from "../../fakes/FakeSubscriptionRepository";
import { buildCarrier, buildSubscription, CARRIER_ID } from "../../setup/factories";

const NOW = new Date("2026-11-20T12:00:00.000Z");
const OTHER_CARRIER_ID = "c0000000-0000-4000-8000-000000000002";

let sequence = 0;
function fill(overrides: Partial<ShiftFill> = {}): ShiftFill {
  sequence += 1;
  const id = `f0000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  return {
    id,
    shiftId: `50000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    carrierId: CARRIER_ID,
    driverId: "d0000000-0000-4000-8000-000000000001",
    shiftStartsAt: "2026-11-14T12:00:00.000Z",
    shiftEndsAt: "2026-11-14T20:00:00.000Z",
    completedAt: `2026-11-14T22:00:${String(sequence % 60).padStart(2, "0")}.000Z`,
    charge: "billable",
    amountCents: FILL_FEE_CENTS,
    stripeInvoiceItemId: null,
    billedAt: null,
    waivedAt: null,
    waivedBy: null,
    waiveReason: null,
    ...overrides,
  };
}

describe("FillService", () => {
  let fills: FakeFillRepository;
  let carriers: FakeCarrierRepository;
  let subscriptions: FakeSubscriptionRepository;
  let payments: TestPaymentProvider;
  let service: FillService;
  let logged: string[];
  let customerId: string;

  beforeEach(async () => {
    fills = new FakeFillRepository();
    payments = new TestPaymentProvider("https://fleetgridus.com", () => NOW);
    customerId = await payments.createCustomer({ email: "ops@freight.test", name: "Freight", carrierId: CARRIER_ID });
    carriers = new FakeCarrierRepository([buildCarrier({ stripeCustomerId: customerId })]);
    subscriptions = new FakeSubscriptionRepository([buildSubscription({ stripeCustomerId: customerId })]);
    logged = [];
    service = new FillService(
      { fills: () => fills, carriers: () => carriers, subscriptions: () => subscriptions },
      payments,
      (message) => logged.push(message),
      () => NOW,
    );
  });

  it("bills each billable fill as a $35 pending item that the next monthly invoice takes", async () => {
    const billable = fill();
    fills.completing = [billable, fill({ charge: "included", amountCents: 0 })];

    const outcome = await service.runDaily();

    expect(outcome).toEqual({ recorded: 2, included: 1, billed: 1, invoicedNow: 0, failed: 0 });
    const [item] = payments.pendingItems(customerId);
    expect(payments.pendingItems(customerId)).toHaveLength(1);
    expect(item).toMatchObject({ amountCents: 3500, description: "Completed fill, shift on Nov 14, 2026" });
    expect(item?.metadata).toEqual({ fill_id: billable.id, shift_id: billable.shiftId, carrier_id: CARRIER_ID });
    expect(payments.invoices).toHaveLength(0);
    expect(fills.rows.get(billable.id)).toMatchObject({ stripeInvoiceItemId: item?.id, billedAt: NOW.toISOString() });
  });

  it("never charges a fill twice: a second run bills nothing, and a lost stamp reuses the same item", async () => {
    const billable = fill();
    fills.completing = [billable];
    await service.runDaily();
    expect(await service.runDaily()).toMatchObject({ recorded: 0, billed: 0 });

    // The stamp was lost after Stripe made the item: the same idempotency key returns it.
    const itemId = fills.rows.get(billable.id)?.stripeInvoiceItemId;
    fills.rows.set(billable.id, { ...billable });
    await service.runDaily();
    expect(payments.invoiceItems.size).toBe(1);
    expect(fills.rows.get(billable.id)?.stripeInvoiceItemId).toBe(itemId);
  });

  it("invoices at once when the carrier's subscription has ended, so no fill goes unbilled", async () => {
    subscriptions.rows.set("sub_test_0001", { ...buildSubscription({ stripeCustomerId: customerId }), status: "canceled" });
    fills.completing = [fill(), fill()];

    const outcome = await service.runDaily();

    expect(outcome).toMatchObject({ billed: 2, invoicedNow: 1 });
    expect(payments.pendingItems(customerId)).toHaveLength(0);
    expect(payments.invoices).toEqual([{ id: expect.any(String), customerId, itemIds: [...payments.invoiceItems.keys()] }]);
  });

  describe("closeOut (the subscription was cancelled)", () => {
    it("bills the unbilled fills and invoices every pending item in one invoice", async () => {
      fills.completing = [fill()];
      await service.runDaily();
      // A fill recorded but not billed yet (the job had not reached it).
      const late = fill();
      fills.rows.set(late.id, late);

      await service.closeOut(CARRIER_ID);

      expect(payments.invoices).toHaveLength(1);
      expect(payments.invoices[0]?.itemIds).toHaveLength(2);
      expect(payments.pendingItems(customerId)).toHaveLength(0);
      expect(fills.rows.get(late.id)?.billedAt).toBe(NOW.toISOString());
    });

    it("does nothing more when run again, or when nothing is pending", async () => {
      fills.completing = [fill()];
      await service.runDaily();
      await service.closeOut(CARRIER_ID);
      await service.closeOut(CARRIER_ID);
      expect(payments.invoices).toHaveLength(1);
    });

    it("skips a carrier with no billing account", async () => {
      carriers.rows.set(CARRIER_ID, buildCarrier({ stripeCustomerId: null }));
      await service.closeOut(CARRIER_ID);
      expect(payments.invoices).toHaveLength(0);
    });
  });

  it("logs a carrier it cannot bill and keeps going with the others; the fill waits for the next run", async () => {
    const otherCustomer = await payments.createCustomer({ email: "b@freight.test", name: "B", carrierId: OTHER_CARRIER_ID });
    carriers.rows.set(OTHER_CARRIER_ID, buildCarrier({ id: OTHER_CARRIER_ID, stripeCustomerId: otherCustomer }));
    subscriptions.rows.set("sub_other", buildSubscription({ id: "s2", carrierId: OTHER_CARRIER_ID, stripeSubscriptionId: "sub_other", stripeCustomerId: otherCustomer }));
    carriers.rows.set(CARRIER_ID, buildCarrier({ stripeCustomerId: null }));
    const stuck = fill();
    fills.completing = [stuck, fill({ carrierId: OTHER_CARRIER_ID })];

    const outcome = await service.runDaily();

    expect(outcome).toMatchObject({ billed: 1, failed: 1 });
    expect(logged).toEqual([`Completed fills for carrier ${CARRIER_ID}, who has no billing account`]);
    expect(fills.rows.get(stuck.id)?.billedAt).toBeNull();
  });

  it("describes the charge with the shift's date in Houston time", () => {
    expect(fillChargeDescription(fill({ shiftStartsAt: "2026-11-15T03:00:00.000Z" }))).toBe("Completed fill, shift on Nov 14, 2026");
  });
});
