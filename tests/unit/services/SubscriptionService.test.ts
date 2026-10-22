// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import type {
  IPaymentProvider,
  PaymentEvent,
  SubscriptionSnapshot,
} from "@/server/providers/PaymentProvider";
import { SUBSCRIPTION_RECHECK_HOURS } from "@/lib/constants";
import { TestPaymentProvider } from "@/server/providers/TestPaymentProvider";
import { CarrierService } from "@/server/services/CarrierService";
import { isSubscriptionStale, SubscriptionService } from "@/server/services/SubscriptionService";
import { FakeCarrierRepository } from "../../fakes/FakeCarrierRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeServiceAreaRepository } from "../../fakes/FakeServiceAreaRepository";
import { FakeSubscriptionRepository } from "../../fakes/FakeSubscriptionRepository";
import { FakeTosRepository } from "../../fakes/FakeTosRepository";
import { FakeWaitlistRepository } from "../../fakes/FakeWaitlistRepository";
import { FakeWebhookEventRepository } from "../../fakes/FakeWebhookEventRepository";
import { FakeZipProvider } from "../../fakes/FakeZipProvider";
import {
  buildCarrierProfile,
  CARRIER_USER_ID,
  PLACES,
  validCarrierDetails,
} from "../../setup/factories";

const APP_URL = "https://fleetgridus.com";
const NOW = new Date("2026-10-13T12:00:00.000Z");
const CONTEXT = { ip: null, userAgent: null };

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const snapshot = (overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  stripeSubscriptionId: "sub_1",
  stripeCustomerId: "cus_test_0001",
  status: "active",
  priceId: "price_monthly",
  currentPeriodEnd: "2026-11-13T12:00:00.000Z",
  cancelAtPeriodEnd: false,
  canceledAt: null,
  ...overrides,
});

describe("SubscriptionService", () => {
  let carriers: FakeCarrierRepository;
  let subscriptions: FakeSubscriptionRepository;
  let events: FakeWebhookEventRepository;
  let payments: TestPaymentProvider;
  let carrierService: CarrierService;
  let service: SubscriptionService;
  let logged: string[];
  let privilegedBuilds: number;
  /** The service's clock. Tests move it to make the stored subscription stale. */
  let clock: Date;

  beforeEach(() => {
    carriers = new FakeCarrierRepository();
    subscriptions = new FakeSubscriptionRepository();
    events = new FakeWebhookEventRepository();
    payments = new TestPaymentProvider(APP_URL, () => NOW);
    logged = [];
    privilegedBuilds = 0;
    clock = NOW;
    carrierService = new CarrierService(
      carriers,
      new FakeProfileRepository([buildCarrierProfile()]),
      new FakeZipProvider(Object.values(PLACES)),
      new FakeServiceAreaRepository((lat) => lat < 31),
      new FakeTosRepository(),
      new FakeWaitlistRepository(),
      subscriptions,
    );
    service = new SubscriptionService(
      carrierService,
      subscriptions,
      {
        carriers: () => {
          privilegedBuilds += 1;
          return carriers;
        },
        subscriptions: () => subscriptions,
        webhookEvents: () => events,
      },
      payments,
      APP_URL,
      (message) => logged.push(message),
      () => clock,
    );
  });

  /** A carrier with the details saved and the Terms accepted, ready to pay. */
  async function readyToPay(zip = PLACES.houston.zip) {
    const carrier = await carrierService.createCarrier(CARRIER_USER_ID, validCarrierDetails({ zip }));
    await carrierService.acceptTerms(CARRIER_USER_ID, { accepted: true }, CONTEXT);
    return carrier;
  }

  describe("startCheckout", () => {
    it("creates the Stripe customer once, stores its id with the service role, and returns the checkout URL", async () => {
      const carrier = await readyToPay();
      const { url } = await service.startCheckout(CARRIER_USER_ID);

      expect(url).toBe(`${APP_URL}/carrier/billing/test-checkout?customer=cus_test_0001`);
      expect(payments.customers.get("cus_test_0001")).toEqual({
        email: "billing@bayoufreight.example",
        name: "Bayou Freight LLC",
        carrierId: carrier.id,
      });
      expect(carriers.rows.get(carrier.id)?.stripeCustomerId).toBe("cus_test_0001");
      expect(privilegedBuilds).toBe(1);
      expect(payments.checkouts).toEqual([
        {
          customerId: "cus_test_0001",
          carrierId: carrier.id,
          successUrl: `${APP_URL}/carrier/billing?checkout=success`,
          cancelUrl: `${APP_URL}/carrier/billing?checkout=cancelled`,
        },
      ]);

      // A second checkout reuses the customer.
      await service.startCheckout(CARRIER_USER_ID);
      expect(payments.customers.size).toBe(1);
      expect(privilegedBuilds).toBe(1);
    });

    it("brings the Stripe customer's email and name up to date before every later checkout", async () => {
      const carrier = await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      // The carrier fixes the billing email after the first visit (the user's report: Stripe
      // kept pre-filling the old, rejected address).
      await carrierService.updateCarrier(
        CARRIER_USER_ID,
        validCarrierDetails({ billingEmail: "accounts@bayoufreight.com", companyName: "Bayou Freight Co" }),
      );
      await service.startCheckout(CARRIER_USER_ID);
      expect(payments.customers.get("cus_test_0001")).toEqual({
        email: "accounts@bayoufreight.com",
        name: "Bayou Freight Co",
        carrierId: carrier.id,
      });
      expect(payments.customers.size).toBe(1);
    });

    it("does not open checkout when the customer cannot be updated", async () => {
      await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      payments.customers.clear();
      expect((await expectAppError(service.startCheckout(CARRIER_USER_ID))).code).toBe("NOT_FOUND");
      expect(payments.checkouts).toHaveLength(1);
    });

    it("needs the company saved, the Terms accepted and a yard in the launch area", async () => {
      expect((await expectAppError(service.startCheckout(CARRIER_USER_ID))).code).toBe("NOT_FOUND");

      await carrierService.createCarrier(CARRIER_USER_ID, validCarrierDetails());
      const terms = await expectAppError(service.startCheckout(CARRIER_USER_ID));
      expect(terms.message).toMatch(/Terms/);

      await carrierService.acceptTerms(CARRIER_USER_ID, { accepted: true }, CONTEXT);
      await carrierService.updateCarrier(CARRIER_USER_ID, validCarrierDetails({ zip: PLACES.dallas.zip }));
      const area = await expectAppError(service.startCheckout(CARRIER_USER_ID));
      expect(area.message).toMatch(/isn't available in your area/);
      expect(payments.checkouts).toHaveLength(0);
    });

    it("refuses when a subscription already grants access", async () => {
      const carrier = await readyToPay();
      await subscriptions.upsert({ carrierId: carrier.id, ...snapshot() });
      const error = await expectAppError(service.startCheckout(CARRIER_USER_ID));
      expect(error.code).toBe("CONFLICT");
    });

    it("lets a lapsed carrier pay again", async () => {
      const carrier = await readyToPay();
      await subscriptions.upsert({ carrierId: carrier.id, ...snapshot({ status: "canceled" }) });
      await expect(service.startCheckout(CARRIER_USER_ID)).resolves.toHaveProperty("url");
    });
  });

  describe("openBillingPortal", () => {
    it("opens the portal for the stored customer, returning to the billing page", async () => {
      await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      const { url } = await service.openBillingPortal(CARRIER_USER_ID);
      expect(url).toBe(`${APP_URL}/carrier/billing`);
      expect(payments.portals).toEqual([
        { customerId: "cus_test_0001", returnUrl: `${APP_URL}/carrier/billing` },
      ]);
    });

    it("sends the current billing email to Stripe before opening the portal", async () => {
      await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      await carrierService.updateCarrier(
        CARRIER_USER_ID,
        validCarrierDetails({ billingEmail: "accounts@bayoufreight.com" }),
      );
      await service.openBillingPortal(CARRIER_USER_ID);
      expect(payments.customers.get("cus_test_0001")?.email).toBe("accounts@bayoufreight.com");
    });

    it("needs a customer, so a carrier who never paid is told to subscribe first", async () => {
      await readyToPay();
      const error = await expectAppError(service.openBillingPortal(CARRIER_USER_ID));
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toMatch(/Subscribe first/);
    });
  });

  describe("getBilling", () => {
    it("reports the subscription, access and whether the portal can open", async () => {
      await readyToPay();
      expect(await service.getBilling(CARRIER_USER_ID)).toEqual({
        subscription: null,
        subscribed: false,
        portalAvailable: false,
        testMode: true,
      });
      await service.startCheckout(CARRIER_USER_ID);
      await service.completeTestCheckout(CARRIER_USER_ID, "cus_test_0001");
      const billing = await service.getBilling(CARRIER_USER_ID);
      expect(billing.subscribed).toBe(true);
      expect(billing.portalAvailable).toBe(true);
      expect(billing.subscription?.status).toBe("active");
    });
  });

  describe("syncFromProvider", () => {
    /** Paid at the provider, but no webhook ever reached the app. */
    async function paidWithoutWebhook() {
      const carrier = await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      await payments.simulateCheckoutPaid("cus_test_0001");
      return carrier;
    }

    it("stores the subscription the provider reports, so a lost webhook does not lock a paying carrier out", async () => {
      const carrier = await paidWithoutWebhook();
      expect((await service.getBilling(CARRIER_USER_ID)).subscribed).toBe(false);

      const billing = await service.syncFromProvider(CARRIER_USER_ID);
      expect(billing.subscribed).toBe(true);
      expect(billing.subscription).toMatchObject({ carrierId: carrier.id, status: "active" });
      expect((await carrierService.getAccess(CARRIER_USER_ID)).subscribed).toBe(true);
      // A second read changes nothing.
      await service.syncFromProvider(CARRIER_USER_ID);
      expect(subscriptions.rows.size).toBe(1);
    });

    it("prefers the subscription that grants access over a newer one that does not", async () => {
      await paidWithoutWebhook();
      const failed = await payments.simulateCheckoutPaid("cus_test_0001");
      payments.subscriptions.set(failed.stripeSubscriptionId, { ...failed, status: "incomplete_expired" });

      const billing = await service.syncFromProvider(CARRIER_USER_ID);
      expect(billing.subscribed).toBe(true);
      expect(billing.subscription?.stripeSubscriptionId).toBe("sub_test_0002");
    });

    it("records a cancellation the webhook missed", async () => {
      const carrier = await paidWithoutWebhook();
      await subscriptions.upsert({ carrierId: carrier.id, ...(await payments.getSubscription("sub_test_0002")) });
      await payments.cancelSubscription("sub_test_0002");

      const billing = await service.syncFromProvider(CARRIER_USER_ID);
      expect(billing.subscribed).toBe(false);
      expect(billing.subscription?.status).toBe("canceled");
    });

    it("does nothing before the first checkout", async () => {
      await readyToPay();
      expect(await service.syncFromProvider(CARRIER_USER_ID)).toMatchObject({ subscription: null, subscribed: false });
      expect(subscriptions.rows.size).toBe(0);
    });

    it("keeps the stored state and logs when the provider cannot be reached", async () => {
      const carrier = await paidWithoutWebhook();
      await subscriptions.upsert({ carrierId: carrier.id, ...snapshot() });
      payments.listSubscriptions = async () => {
        throw new Error("Stripe is down");
      };
      const billing = await service.syncFromProvider(CARRIER_USER_ID);
      expect(billing.subscribed).toBe(true);
      expect(logged).toEqual(["Could not read the subscription from the payment provider"]);
    });
  });

  describe("needsRecheck and isSubscriptionStale (the fallback when a webhook never comes)", () => {
    const later = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

    it("a subscription written less than the recheck window ago is trusted", async () => {
      const carrier = await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      await subscriptions.upsert({ carrierId: carrier.id, ...snapshot() });
      clock = later(SUBSCRIPTION_RECHECK_HOURS - 1);
      expect(service.needsRecheck(await carrierService.getAccess(CARRIER_USER_ID))).toBe(false);
    });

    it("one older than the window is read again, whatever its status", async () => {
      const carrier = await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      await subscriptions.upsert({ carrierId: carrier.id, ...snapshot() });
      clock = later(SUBSCRIPTION_RECHECK_HOURS + 1);
      expect(service.needsRecheck(await carrierService.getAccess(CARRIER_USER_ID))).toBe(true);

      await subscriptions.upsert({ carrierId: carrier.id, ...snapshot({ status: "past_due" }) });
      // The store stamped it now; move past the window again.
      clock = later(2 * SUBSCRIPTION_RECHECK_HOURS + 2);
      expect(service.needsRecheck(await carrierService.getAccess(CARRIER_USER_ID))).toBe(true);
    });

    it("an active subscription whose paid period has ended is read again at once", async () => {
      const carrier = await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      await subscriptions.upsert({
        carrierId: carrier.id,
        ...snapshot({ currentPeriodEnd: later(1).toISOString() }),
      });
      clock = later(2);
      expect(service.needsRecheck(await carrierService.getAccess(CARRIER_USER_ID))).toBe(true);
    });

    it("never paid, or no Stripe customer: nothing to ask about", async () => {
      await readyToPay();
      clock = later(100);
      expect(service.needsRecheck(await carrierService.getAccess(CARRIER_USER_ID))).toBe(false);
      expect(isSubscriptionStale(null, clock)).toBe(false);
    });

    it("refreshAccess is what the guard uses: a missed cancellation closes the search on the next visit", async () => {
      const carrier = await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      const live = await payments.simulateCheckoutPaid("cus_test_0001");
      await subscriptions.upsert({ carrierId: carrier.id, ...live });
      expect((await carrierService.getAccess(CARRIER_USER_ID)).subscribed).toBe(true);

      // Cancelled at Stripe; the webhook was lost; the window passes.
      await payments.cancelSubscription(live.stripeSubscriptionId);
      clock = later(SUBSCRIPTION_RECHECK_HOURS + 1);
      const access = await carrierService.getAccess(CARRIER_USER_ID);
      expect(service.needsRecheck(access)).toBe(true);
      const refreshed = await service.refreshAccess(CARRIER_USER_ID);
      expect(refreshed.subscribed).toBe(false);
      expect(refreshed.stage).toBe("billing");
      expect(refreshed.subscription?.status).toBe("canceled");
    });
  });

  describe("keepSubscription (Keep my subscription)", () => {
    /** Paid, then set to end at the period end, as the portal or the Dashboard would. */
    async function endingAtPeriodEnd() {
      const carrier = await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      const live = await payments.simulateCheckoutPaid("cus_test_0001");
      const ending = { ...live, cancelAtPeriodEnd: true, canceledAt: NOW.toISOString() };
      payments.subscriptions.set(live.stripeSubscriptionId, ending);
      await subscriptions.upsert({ carrierId: carrier.id, ...ending });
      return { carrier, live };
    }

    it("clears the scheduled cancellation at the provider and in the stored row", async () => {
      const { carrier, live } = await endingAtPeriodEnd();
      expect((await carrierService.getAccess(CARRIER_USER_ID)).subscription?.cancelAtPeriodEnd).toBe(true);

      const kept = await service.keepSubscription(CARRIER_USER_ID);
      expect(kept).toMatchObject({
        carrierId: carrier.id,
        stripeSubscriptionId: live.stripeSubscriptionId,
        status: "active",
        cancelAtPeriodEnd: false,
        canceledAt: null,
      });
      expect(payments.subscriptions.get(live.stripeSubscriptionId)?.cancelAtPeriodEnd).toBe(false);
      const access = await carrierService.getAccess(CARRIER_USER_ID);
      expect(access.subscribed).toBe(true);
      expect(access.subscription?.cancelAtPeriodEnd).toBe(false);
    });

    it("refuses when nothing is ending: no company, no access subscription, or one not set to end", async () => {
      expect((await expectAppError(service.keepSubscription(CARRIER_USER_ID))).code).toBe("NOT_FOUND");

      await readyToPay();
      const none = await expectAppError(service.keepSubscription(CARRIER_USER_ID));
      expect(none.code).toBe("VALIDATION");
      expect(none.message).toMatch(/no subscription to keep/);

      await service.startCheckout(CARRIER_USER_ID);
      await service.completeTestCheckout(CARRIER_USER_ID, "cus_test_0001");
      const notEnding = await expectAppError(service.keepSubscription(CARRIER_USER_ID));
      expect(notEnding.message).toMatch(/not set to end/);
    });

    it("leaves the row as it was when the provider fails", async () => {
      await endingAtPeriodEnd();
      payments.resumeSubscription = async () => {
        throw new Error("Stripe is down");
      };
      await expect(service.keepSubscription(CARRIER_USER_ID)).rejects.toThrow("Stripe is down");
      expect((await carrierService.getAccess(CARRIER_USER_ID)).subscription?.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe("reconcileAll (the scheduled pass)", () => {
    it("re-reads only the stale subscriptions and the carriers with no row yet, and counts what changed", async () => {
      // Carrier A: paid, webhook lost, no row at all.
      const a = await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      await payments.simulateCheckoutPaid("cus_test_0001");
      // Carrier B: fresh row, left alone.
      const b = await carriers.create("profile-b", { ...validCarrierDetails(), ...PLACES.houston, usdot: null, mc: null });
      await carriers.update(b.id, { stripeCustomerId: "cus_b" });
      payments.customers.set("cus_b", { email: "b@x.com", name: "B", carrierId: b.id });
      const liveB = await payments.simulateCheckoutPaid("cus_b");
      await subscriptions.upsert({ carrierId: b.id, ...liveB });
      // Carrier C: active row gone stale, cancelled at Stripe meanwhile.
      const c = await carriers.create("profile-c", { ...validCarrierDetails(), ...PLACES.houston, usdot: null, mc: null });
      await carriers.update(c.id, { stripeCustomerId: "cus_c" });
      payments.customers.set("cus_c", { email: "c@x.com", name: "C", carrierId: c.id });
      const liveC = await payments.simulateCheckoutPaid("cus_c");
      await subscriptions.upsert({ carrierId: c.id, ...liveC });
      await payments.cancelSubscription(liveC.stripeSubscriptionId);
      // Carrier D: no customer, never looked at.
      await carriers.create("profile-d", { ...validCarrierDetails(), ...PLACES.houston, usdot: null, mc: null });

      // Only C's row is old enough: B's was written at the same moment, so make B's fresh
      // by writing it after the clock moves.
      clock = new Date(NOW.getTime() + (SUBSCRIPTION_RECHECK_HOURS + 1) * 3_600_000);
      subscriptions.rows.set(liveB.stripeSubscriptionId, {
        ...subscriptions.rows.get(liveB.stripeSubscriptionId)!,
        updatedAt: clock.toISOString(),
      });

      const outcome = await service.reconcileAll();
      expect(outcome).toEqual({ carriers: 3, checked: 2, changed: 2, failed: 0 });
      expect((await subscriptions.findActiveByCarrierId(a.id))?.status).toBe("active");
      expect((await subscriptions.findCurrentByCarrierId(c.id))?.status).toBe("canceled");
      expect(await subscriptions.findActiveByCarrierId(c.id)).toBeNull();
      expect((await subscriptions.findCurrentByCarrierId(b.id))?.updatedAt).toBe(clock.toISOString());
    });

    it("logs a carrier the provider fails on and carries on with the rest", async () => {
      const a = await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      await payments.simulateCheckoutPaid("cus_test_0001");
      const b = await carriers.create("profile-b", { ...validCarrierDetails(), ...PLACES.houston, usdot: null, mc: null });
      await carriers.update(b.id, { stripeCustomerId: "cus_broken" });
      const list = payments.listSubscriptions.bind(payments);
      payments.listSubscriptions = async (customerId) => {
        if (customerId === "cus_broken") throw new Error("Stripe is down");
        return list(customerId);
      };
      const outcome = await service.reconcileAll();
      expect(outcome).toEqual({ carriers: 2, checked: 2, changed: 1, failed: 1 });
      expect((await subscriptions.findActiveByCarrierId(a.id))?.status).toBe("active");
      expect(logged).toEqual([`Could not reconcile the subscription of carrier ${b.id}`]);
    });
  });

  describe("completeTestCheckout", () => {
    it("writes an active subscription for the carrier's own customer only", async () => {
      const carrier = await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      const subscription = await service.completeTestCheckout(CARRIER_USER_ID, "cus_test_0001");
      expect(subscription).toMatchObject({
        carrierId: carrier.id,
        status: "active",
        stripeCustomerId: "cus_test_0001",
        currentPeriodEnd: "2026-11-12T12:00:00.000Z",
      });
      const wrong = await expectAppError(service.completeTestCheckout(CARRIER_USER_ID, "cus_other"));
      expect(wrong.code).toBe("FORBIDDEN");
    });

    it("is refused when the provider is not the test one", async () => {
      // The same provider without the test-only method, as Stripe's looks to the service.
      const withoutTestCheckout: IPaymentProvider = {
        mode: "stripe",
        createCustomer: (input) => payments.createCustomer(input),
        updateCustomer: (id, input) => payments.updateCustomer(id, input),
        createCheckoutSession: (input) => payments.createCheckoutSession(input),
        createPortalSession: (input) => payments.createPortalSession(input),
        getSubscription: (id) => payments.getSubscription(id),
        listSubscriptions: (id) => payments.listSubscriptions(id),
        resumeSubscription: (id) => payments.resumeSubscription(id),
        cancelSubscription: (id) => payments.cancelSubscription(id),
        parseWebhookEvent: (body, signature) => payments.parseWebhookEvent(body, signature),
      };
      const stripeLike = new SubscriptionService(
        carrierService,
        subscriptions,
        { carriers: () => carriers, subscriptions: () => subscriptions, webhookEvents: () => events },
        withoutTestCheckout,
        APP_URL,
      );
      await readyToPay();
      const error = await expectAppError(stripeLike.completeTestCheckout(CARRIER_USER_ID, "cus_x"));
      expect(error.code).toBe("FORBIDDEN");
    });
  });

  describe("handleWebhook", () => {
    const event = (id: string, overrides: Partial<PaymentEvent>): PaymentEvent => ({
      id,
      type: "customer.subscription.updated",
      subscriptionId: null,
      subscription: null,
      ...overrides,
    });

    async function customerExists() {
      const carrier = await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      return carrier;
    }

    it("rejects a bad signature before anything else", async () => {
      const error = await expectAppError(service.handleWebhook("{}", "sig_unknown"));
      expect(error.code).toBe("VALIDATION");
      expect(events.recorded.size).toBe(0);
    });

    it("writes the subscription the event names, and ignores a replay of the same event", async () => {
      const carrier = await customerExists();
      payments.subscriptions.set("sub_1", snapshot());
      payments.events.set("sig_1", event("evt_1", { subscription: snapshot() }));

      await expect(service.handleWebhook("{}", "sig_1")).resolves.toEqual({
        handled: true,
        duplicate: false,
      });
      expect(subscriptions.rows.get("sub_1")).toMatchObject({
        carrierId: carrier.id,
        status: "active",
        priceId: "price_monthly",
      });

      await expect(service.handleWebhook("{}", "sig_1")).resolves.toEqual({
        handled: false,
        duplicate: true,
      });
      expect(subscriptions.upserts).toHaveLength(1);
    });

    it("fetches the subscription when the event carries only its id (checkout, invoices)", async () => {
      await customerExists();
      payments.subscriptions.set("sub_1", snapshot());
      payments.events.set(
        "sig_checkout",
        event("evt_2", { type: "checkout.session.completed", subscriptionId: "sub_1" }),
      );
      await expect(service.handleWebhook("{}", "sig_checkout")).resolves.toMatchObject({ handled: true });
      expect(subscriptions.rows.get("sub_1")?.status).toBe("active");

      payments.subscriptions.set("sub_1", snapshot({ status: "past_due" }));
      payments.events.set(
        "sig_failed",
        event("evt_3", { type: "invoice.payment_failed", subscriptionId: "sub_1" }),
      );
      await service.handleWebhook("{}", "sig_failed");
      expect(subscriptions.rows.get("sub_1")?.status).toBe("past_due");
      expect((await carrierService.getAccess(CARRIER_USER_ID)).subscribed).toBe(false);
    });

    it("a cancellation ends access", async () => {
      await customerExists();
      payments.subscriptions.set("sub_1", snapshot());
      payments.events.set("sig_on", event("evt_4", { subscription: snapshot() }));
      await service.handleWebhook("{}", "sig_on");
      expect((await carrierService.getAccess(CARRIER_USER_ID)).subscribed).toBe(true);

      const cancelled = snapshot({ status: "canceled", canceledAt: NOW.toISOString() });
      payments.subscriptions.set("sub_1", cancelled);
      payments.events.set(
        "sig_off",
        event("evt_5", { type: "customer.subscription.deleted", subscription: cancelled }),
      );
      await service.handleWebhook("{}", "sig_off");
      expect((await carrierService.getAccess(CARRIER_USER_ID)).subscribed).toBe(false);
      expect(subscriptions.rows.get("sub_1")?.canceledAt).toBe(NOW.toISOString());
    });

    it("writes the provider's current state, not the event's copy, so events out of order cannot roll access back", async () => {
      await customerExists();
      // Stripe holds "active"; the late "created: incomplete" event arrives afterwards.
      payments.subscriptions.set("sub_1", snapshot());
      payments.events.set(
        "sig_late",
        event("evt_late", {
          type: "customer.subscription.created",
          subscription: snapshot({ status: "incomplete" }),
        }),
      );
      await expect(service.handleWebhook("{}", "sig_late")).resolves.toMatchObject({ handled: true });
      expect(subscriptions.rows.get("sub_1")?.status).toBe("active");
      expect((await carrierService.getAccess(CARRIER_USER_ID)).subscribed).toBe(true);
    });

    it("acknowledges event types it does not act on without recording them", async () => {
      payments.events.set("sig_other", event("evt_6", { type: "customer.created" }));
      await expect(service.handleWebhook("{}", "sig_other")).resolves.toEqual({
        handled: false,
        duplicate: false,
        reason: "ignored_type",
      });
      expect(events.recorded.size).toBe(0);
    });

    it("acknowledges an event with no subscription, and one for a customer it does not know", async () => {
      payments.events.set("sig_none", event("evt_7", { type: "checkout.session.completed" }));
      await expect(service.handleWebhook("{}", "sig_none")).resolves.toMatchObject({
        reason: "no_subscription",
      });
      const stranger = snapshot({ stripeSubscriptionId: "sub_stranger", stripeCustomerId: "cus_stranger" });
      payments.subscriptions.set("sub_stranger", stranger);
      payments.events.set("sig_stranger", event("evt_8", { subscription: stranger }));
      await expect(service.handleWebhook("{}", "sig_stranger")).resolves.toMatchObject({
        reason: "unknown_customer",
      });
      expect(logged).toEqual(["Stripe event for an unknown customer"]);
      expect(subscriptions.upserts).toHaveLength(0);
    });

    it("forgets the event when processing fails, so the provider's retry is processed", async () => {
      await customerExists();
      payments.events.set(
        "sig_fetch",
        event("evt_9", { type: "invoice.paid", subscriptionId: "sub_missing" }),
      );
      await expect(service.handleWebhook("{}", "sig_fetch")).rejects.toBeInstanceOf(AppError);
      expect(events.recorded.size).toBe(0);

      payments.subscriptions.set("sub_missing", snapshot({ stripeSubscriptionId: "sub_missing" }));
      await expect(service.handleWebhook("{}", "sig_fetch")).resolves.toMatchObject({ handled: true });
    });
  });

  describe("cancelForAccountDeletion", () => {
    it("cancels the active subscription with the provider, and does nothing otherwise", async () => {
      await service.cancelForAccountDeletion(CARRIER_USER_ID);
      expect(payments.cancelled).toEqual([]);

      await readyToPay();
      await service.startCheckout(CARRIER_USER_ID);
      await service.completeTestCheckout(CARRIER_USER_ID, "cus_test_0001");
      await service.cancelForAccountDeletion(CARRIER_USER_ID);
      expect(payments.cancelled).toEqual(["sub_test_0002"]);
    });

    it("is quiet for a driver", async () => {
      await expect(service.cancelForAccountDeletion("someone-else")).resolves.toBeUndefined();
    });
  });
});
