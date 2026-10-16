// @vitest-environment node
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { parseServerEnv } from "@/lib/env";
import { AppError } from "@/server/errors/AppError";
import { createPaymentProvider } from "@/server/providers/createPaymentProvider";
import { isSubscriptionEventType, SUBSCRIPTION_EVENT_TYPES } from "@/server/providers/PaymentProvider";
import { reduceEvent, snapshotOf, StripeProvider } from "@/server/providers/StripeProvider";
import { TEST_CHECKOUT_PATH, TestPaymentProvider } from "@/server/providers/TestPaymentProvider";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-10-13T12:00:00.000Z");
const PERIOD_END = Math.floor(new Date("2026-11-13T12:00:00.000Z").getTime() / 1000);

/** The parts of a Stripe subscription object the provider reads. */
function stripeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    object: "subscription",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    items: { data: [{ price: { id: "price_monthly" }, current_period_end: PERIOD_END }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

const stripeEvent = (type: string, object: unknown) =>
  ({ id: "evt_1", type, data: { object } }) as unknown as Stripe.Event;

describe("TestPaymentProvider", () => {
  it("runs a whole subscription life in memory", async () => {
    const payments = new TestPaymentProvider("https://app.test", () => NOW);
    const customerId = await payments.createCustomer({ email: "a@b.c", name: "Co", carrierId: "c1" });
    expect(customerId).toBe("cus_test_0001");
    await payments.updateCustomer(customerId, { email: "d@e.com", name: "Co 2" });
    expect(payments.customers.get(customerId)).toEqual({ email: "d@e.com", name: "Co 2", carrierId: "c1" });
    await expect(payments.updateCustomer("cus_nobody", { email: "x@y.com", name: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const url = await payments.createCheckoutSession({
      customerId,
      carrierId: "c1",
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
    });
    expect(url).toBe(`https://app.test${TEST_CHECKOUT_PATH}?customer=cus_test_0001`);

    const subscription = await payments.simulateCheckoutPaid(customerId);
    expect(subscription).toEqual({
      stripeSubscriptionId: "sub_test_0002",
      stripeCustomerId: customerId,
      status: "active",
      priceId: "price_test_monthly",
      currentPeriodEnd: "2026-11-12T12:00:00.000Z",
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });
    await expect(payments.getSubscription("sub_test_0002")).resolves.toEqual(subscription);

    await payments.cancelSubscription("sub_test_0002");
    expect((await payments.getSubscription("sub_test_0002")).status).toBe("canceled");
    expect(payments.cancelled).toEqual(["sub_test_0002"]);

    await expect(payments.createPortalSession({ customerId, returnUrl: "https://app.test/b" })).resolves.toBe(
      "https://app.test/b",
    );
  });

  it("refuses unknown customers and subscriptions, and unsigned webhooks", async () => {
    const payments = new TestPaymentProvider("https://app.test");
    await expect(
      payments.createCheckoutSession({ customerId: "cus_x", carrierId: "c", successUrl: "a", cancelUrl: "b" }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(payments.simulateCheckoutPaid("cus_x")).rejects.toBeInstanceOf(AppError);
    await expect(payments.getSubscription("sub_x")).rejects.toBeInstanceOf(AppError);
    await expect(payments.cancelSubscription("sub_x")).resolves.toBeUndefined();
    await expect(payments.parseWebhookEvent("{}", null)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("StripeProvider", () => {
  it("keeps the fields the app needs from a subscription object", () => {
    expect(snapshotOf(stripeSubscription())).toEqual({
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      status: "active",
      priceId: "price_monthly",
      currentPeriodEnd: "2026-11-13T12:00:00.000Z",
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });
    expect(
      snapshotOf(
        stripeSubscription({
          customer: { id: "cus_obj" },
          status: "something_new",
          canceled_at: PERIOD_END,
          items: { data: [] },
        }),
      ),
    ).toMatchObject({
      stripeCustomerId: "cus_obj",
      status: "unpaid",
      priceId: null,
      currentPeriodEnd: null,
      canceledAt: "2026-11-13T12:00:00.000Z",
    });
  });

  it("reduces each event type to the subscription it concerns", () => {
    for (const type of [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "customer.subscription.paused",
      "customer.subscription.resumed",
    ]) {
      expect(reduceEvent(stripeEvent(type, stripeSubscription()))).toMatchObject({
        id: "evt_1",
        type,
        subscriptionId: null,
        subscription: { stripeSubscriptionId: "sub_123" },
      });
    }
    expect(reduceEvent(stripeEvent("checkout.session.completed", { subscription: "sub_123" }))).toEqual({
      id: "evt_1",
      type: "checkout.session.completed",
      subscriptionId: "sub_123",
      subscription: null,
    });
    expect(
      reduceEvent(stripeEvent("invoice.paid", { parent: { subscription_details: { subscription: { id: "sub_9" } } } })),
    ).toMatchObject({ subscriptionId: "sub_9" });
    expect(reduceEvent(stripeEvent("invoice.payment_failed", { parent: null }))).toMatchObject({
      subscriptionId: null,
    });
    expect(reduceEvent(stripeEvent("customer.created", {}))).toEqual({
      id: "evt_1",
      type: "customer.created",
      subscriptionId: null,
      subscription: null,
    });
  });

  it("verifies the webhook signature with the secret", async () => {
    const stripe = new Stripe("sk_test_fake");
    const provider = new StripeProvider(stripe, { priceId: "price_1", webhookSecret: "whsec_test" });
    const payload = JSON.stringify(stripeEvent("checkout.session.completed", { subscription: "sub_123" }));
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });

    await expect(provider.parseWebhookEvent(payload, header)).resolves.toMatchObject({
      type: "checkout.session.completed",
      subscriptionId: "sub_123",
    });

    const forged = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
    await expect(provider.parseWebhookEvent(payload, forged)).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Invalid Stripe signature",
    });
    await expect(provider.parseWebhookEvent(payload, null)).rejects.toMatchObject({
      message: "Missing Stripe signature",
    });
  });

  it("talks to Stripe for customers, checkout, the portal, subscriptions and cancellation", async () => {
    const calls: Record<string, unknown[]> = {};
    const record = (name: string, result: unknown) =>
      vi.fn(async (...args: unknown[]) => {
        calls[name] = args;
        return result;
      });
    const stripe = {
      customers: {
        create: record("customers.create", { id: "cus_new" }),
        update: record("customers.update", { id: "cus_new" }),
      },
      checkout: { sessions: { create: record("checkout.create", { url: "https://checkout.stripe.test/s" }) } },
      billingPortal: { sessions: { create: record("portal.create", { url: "https://billing.stripe.test/p" }) } },
      subscriptions: {
        retrieve: record("subscriptions.retrieve", stripeSubscription()),
        cancel: record("subscriptions.cancel", {}),
      },
    } as unknown as Stripe;
    const provider = new StripeProvider(stripe, { priceId: "price_1", webhookSecret: "whsec" });

    await expect(provider.createCustomer({ email: "a@b.c", name: "Co", carrierId: "c1" })).resolves.toBe("cus_new");
    expect(calls["customers.create"][0]).toEqual({ email: "a@b.c", name: "Co", metadata: { carrier_id: "c1" } });

    await provider.updateCustomer("cus_new", { email: "new@b.com", name: "Co 2" });
    expect(calls["customers.update"]).toEqual(["cus_new", { email: "new@b.com", name: "Co 2" }]);

    await expect(
      provider.createCheckoutSession({ customerId: "cus_new", carrierId: "c1", successUrl: "s", cancelUrl: "c" }),
    ).resolves.toBe("https://checkout.stripe.test/s");
    expect(calls["checkout.create"][0]).toMatchObject({
      mode: "subscription",
      customer: "cus_new",
      line_items: [{ price: "price_1", quantity: 1 }],
      success_url: "s",
      cancel_url: "c",
      subscription_data: { metadata: { carrier_id: "c1" } },
    });

    await expect(provider.createPortalSession({ customerId: "cus_new", returnUrl: "r" })).resolves.toBe(
      "https://billing.stripe.test/p",
    );
    expect(calls["portal.create"][0]).toEqual({ customer: "cus_new", return_url: "r" });

    await expect(provider.getSubscription("sub_123")).resolves.toMatchObject({ stripeSubscriptionId: "sub_123" });
    await provider.cancelSubscription("sub_123");
    expect(calls["subscriptions.cancel"][0]).toBe("sub_123");
  });

  it("fails plainly when checkout returns no URL, and ignores cancelling a subscription Stripe no longer has", async () => {
    const gone = new Stripe.errors.StripeInvalidRequestError({
      type: "invalid_request_error",
      message: "No such subscription",
      statusCode: 404,
    } as never);
    const stripe = {
      checkout: { sessions: { create: async () => ({ url: null }) } },
      subscriptions: {
        cancel: async () => {
          throw gone;
        },
      },
    } as unknown as Stripe;
    const provider = new StripeProvider(stripe, { priceId: "price_1", webhookSecret: "whsec" });
    await expect(
      provider.createCheckoutSession({ customerId: "c", carrierId: "c", successUrl: "s", cancelUrl: "c" }),
    ).rejects.toMatchObject({ code: "INTERNAL" });
    await expect(provider.cancelSubscription("sub_gone")).resolves.toBeUndefined();
  });
});

describe("the event types the webhook acts on", () => {
  it("are the checkout, subscription and invoice events", () => {
    expect(SUBSCRIPTION_EVENT_TYPES).toEqual([
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "customer.subscription.paused",
      "customer.subscription.resumed",
      "invoice.paid",
      "invoice.payment_failed",
    ]);
    expect(isSubscriptionEventType("invoice.paid")).toBe(true);
    expect(isSubscriptionEventType("customer.created")).toBe(false);
  });
});

describe("createPaymentProvider", () => {
  const BASE = {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
  };

  it("picks Stripe when every Stripe key is set", () => {
    const provider = createPaymentProvider(
      parseServerEnv({
        ...BASE,
        STRIPE_SECRET_KEY: "sk_test_x",
        STRIPE_PRICE_ID_MONTHLY: "price_x",
        STRIPE_WEBHOOK_SECRET: "whsec_x",
      }),
    );
    expect(provider).toBeInstanceOf(StripeProvider);
  });

  it("picks the test provider only with the test-login flag and no Stripe key", () => {
    expect(createPaymentProvider(parseServerEnv({ ...BASE, ENABLE_TEST_LOGIN: "true" }))).toBeInstanceOf(
      TestPaymentProvider,
    );
    expect(
      createPaymentProvider(
        parseServerEnv({ ...BASE, ENABLE_TEST_LOGIN: "true", STRIPE_SECRET_KEY: "sk_test_x" }),
      ),
    ).not.toBeInstanceOf(TestPaymentProvider);
  });

  it("PAYMENT_TEST_MODE keeps the test checkout over Stripe, but only with the test-login flag", () => {
    const stripeKeys = {
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_PRICE_ID_MONTHLY: "price_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
    };
    expect(
      createPaymentProvider(
        parseServerEnv({ ...BASE, ...stripeKeys, ENABLE_TEST_LOGIN: "true", PAYMENT_TEST_MODE: "true" }),
      ),
    ).toBeInstanceOf(TestPaymentProvider);
    // Without test login the switch does nothing: Stripe stays.
    expect(
      createPaymentProvider(parseServerEnv({ ...BASE, ...stripeKeys, PAYMENT_TEST_MODE: "true" })),
    ).toBeInstanceOf(StripeProvider);
    // Without the switch, the Stripe keys win as before.
    expect(
      createPaymentProvider(parseServerEnv({ ...BASE, ...stripeKeys, ENABLE_TEST_LOGIN: "true" })),
    ).toBeInstanceOf(StripeProvider);
  });

  it("otherwise says payments are not set up, on every call", async () => {
    const provider = createPaymentProvider(parseServerEnv(BASE));
    expect(provider.mode).toBe("stripe");
    expect(provider.simulateCheckoutPaid).toBeUndefined();
    for (const call of [
      () => provider.createCustomer({ email: "a", name: "b", carrierId: "c" }),
      () => provider.updateCustomer("a", { email: "b", name: "c" }),
      () => provider.createCheckoutSession({ customerId: "a", carrierId: "b", successUrl: "c", cancelUrl: "d" }),
      () => provider.createPortalSession({ customerId: "a", returnUrl: "b" }),
      () => provider.getSubscription("a"),
      () => provider.cancelSubscription("a"),
      () => provider.parseWebhookEvent("{}", "sig"),
    ]) {
      await expect(call()).rejects.toMatchObject({ message: /not set up yet/ });
    }
  });
});
