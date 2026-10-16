// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import type {
  IPaymentProvider,
  PaymentEvent,
  SubscriptionSnapshot,
} from "@/server/providers/PaymentProvider";
import { TestPaymentProvider } from "@/server/providers/TestPaymentProvider";
import { CarrierService } from "@/server/services/CarrierService";
import { SubscriptionService } from "@/server/services/SubscriptionService";
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

  beforeEach(() => {
    carriers = new FakeCarrierRepository();
    subscriptions = new FakeSubscriptionRepository();
    events = new FakeWebhookEventRepository();
    payments = new TestPaymentProvider(APP_URL, () => NOW);
    logged = [];
    privilegedBuilds = 0;
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

    it("writes the subscription the event carries, and ignores a replay of the same event", async () => {
      const carrier = await customerExists();
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
      payments.events.set("sig_on", event("evt_4", { subscription: snapshot() }));
      await service.handleWebhook("{}", "sig_on");
      payments.events.set(
        "sig_off",
        event("evt_5", {
          type: "customer.subscription.deleted",
          subscription: snapshot({ status: "canceled", canceledAt: NOW.toISOString() }),
        }),
      );
      await service.handleWebhook("{}", "sig_off");
      expect((await carrierService.getAccess(CARRIER_USER_ID)).subscribed).toBe(false);
      expect(subscriptions.rows.get("sub_1")?.canceledAt).toBe(NOW.toISOString());
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
      payments.events.set(
        "sig_stranger",
        event("evt_8", { subscription: snapshot({ stripeCustomerId: "cus_stranger" }) }),
      );
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
