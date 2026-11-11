import "server-only";
import { createHash } from "node:crypto";
import Stripe from "stripe";
import { INVOICE_TAX_FOOTER, SUBSCRIPTION_PLAN_NAME } from "@/lib/constants";
import { AppError } from "@/server/errors/AppError";
import type {
  CheckoutSessionInput,
  CreateCustomerInput,
  FillChargeInput,
  IPaymentProvider,
  PaymentEvent,
  PortalSessionInput,
  ReverseFillChargeInput,
  SubscriptionSnapshot,
} from "@/server/providers/PaymentProvider";
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "@/types/domain";

export interface StripeProviderConfig {
  /** The monthly price in the Stripe dashboard. */
  priceId: string;
  webhookSecret: string;
}

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === "string" ? value : (value?.id ?? null);

const isoFromSeconds = (seconds: number | null | undefined): string | null =>
  seconds ? new Date(seconds * 1000).toISOString() : null;

/** Stripe's status strings are the enum's values; anything new is treated as not active. */
function toStatus(status: string): SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
    ? (status as SubscriptionStatus)
    : "unpaid";
}

/**
 * The fields the app keeps, from a Stripe subscription object. A cancellation scheduled for
 * later shows as either `cancel_at_period_end` or a `cancel_at` timestamp (the Dashboard and
 * the portal set the timestamp on this API version), so "ending" means either.
 */
export function snapshotOf(subscription: Stripe.Subscription): SubscriptionSnapshot {
  const item = subscription.items.data[0];
  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: idOf(subscription.customer) ?? "",
    status: toStatus(subscription.status),
    priceId: item?.price?.id ?? null,
    currentPeriodEnd: isoFromSeconds(item?.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end || Boolean(subscription.cancel_at),
    canceledAt: isoFromSeconds(subscription.canceled_at),
    trialStart: isoFromSeconds(subscription.trial_start),
    trialEnd: isoFromSeconds(subscription.trial_end),
  };
}

/** Reduces a verified Stripe event to the subscription it concerns. */
export function reduceEvent(event: Stripe.Event): PaymentEvent {
  const base = { id: event.id, type: event.type, subscriptionId: null, subscription: null };
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return { ...base, subscription: snapshotOf(event.data.object) };
    case "checkout.session.completed":
      return { ...base, subscriptionId: idOf(event.data.object.subscription) };
    case "invoice.paid":
    case "invoice.payment_failed":
      return {
        ...base,
        subscriptionId: idOf(event.data.object.parent?.subscription_details?.subscription),
      };
    default:
      return base;
  }
}

/**
 * Stripe Checkout for the carrier plan ($99 a month after a 7-day trial; fills as invoice items), the Customer Portal for card and plan
 * changes, and signed webhooks. The secret key, price id and webhook secret come from the
 * environment; none of them reaches the browser.
 */
export class StripeProvider implements IPaymentProvider {
  readonly mode = "stripe" as const;

  constructor(
    private readonly stripe: Stripe,
    private readonly config: StripeProviderConfig,
  ) {}

  async createCustomer(input: CreateCustomerInput): Promise<string> {
    const customer = await this.stripe.customers.create({
      email: input.email,
      name: input.name,
      metadata: { carrier_id: input.carrierId },
      invoice_settings: { footer: INVOICE_TAX_FOOTER },
    });
    return customer.id;
  }

  async updateCustomer(customerId: string, input: { email: string; name: string }): Promise<void> {
    await this.stripe.customers.update(customerId, {
      email: input.email,
      name: input.name,
      invoice_settings: { footer: INVOICE_TAX_FOOTER },
    });
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      line_items: [{ price: this.config.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      allow_promotion_codes: false,
      // A card is taken even for the trial; the paid plan starts by itself when it ends.
      payment_method_collection: "always",
      subscription_data: {
        description: SUBSCRIPTION_PLAN_NAME,
        metadata: { carrier_id: input.carrierId },
        ...(input.trialDays
          ? {
              trial_period_days: input.trialDays,
              trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } },
            }
          : {}),
      },
    });
    if (!session.url) throw AppError.internal(new Error("Stripe returned no checkout URL"));
    return session.url;
  }

  async createPortalSession(input: PortalSessionInput): Promise<string> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return session.url;
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    return snapshotOf(await this.stripe.subscriptions.retrieve(subscriptionId));
  }

  async listSubscriptions(customerId: string): Promise<SubscriptionSnapshot[]> {
    // Stripe lists newest first; "all" includes cancelled and incomplete ones.
    const page = await this.stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    return page.data.map(snapshotOf);
  }

  async resumeSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    // Whichever field scheduled the cancellation is the one to clear; Stripe refuses both
    // in one request, and an empty string is how a timestamp is unset.
    const current = await this.stripe.subscriptions.retrieve(subscriptionId);
    if (current.cancel_at_period_end) {
      return snapshotOf(await this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false }));
    }
    if (current.cancel_at) {
      return snapshotOf(await this.stripe.subscriptions.update(subscriptionId, { cancel_at: "" }));
    }
    return snapshotOf(current);
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId);
    } catch (error) {
      // Already cancelled or gone: nothing left to stop.
      if (error instanceof Stripe.errors.StripeError && error.statusCode === 404) return;
      throw error;
    }
  }

  async trialCardFingerprint(subscriptionId: string): Promise<string | null> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId, { expand: ["default_payment_method"] });
    const method = subscription.default_payment_method;
    return typeof method === "object" && method !== null ? (method.card?.fingerprint ?? null) : null;
  }

  async endTrialNow(subscriptionId: string): Promise<SubscriptionSnapshot> {
    return snapshotOf(await this.stripe.subscriptions.update(subscriptionId, { trial_end: "now" }));
  }

  async createFillCharge(input: FillChargeInput): Promise<string> {
    // No subscription on the item: the customer's next invoice (the monthly one, or the
    // one-off below) takes it.
    const item = await this.stripe.invoiceItems.create(
      {
        customer: input.customerId,
        amount: input.amountCents,
        currency: "usd",
        description: input.description,
        metadata: input.metadata,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return item.id;
  }

  async invoicePendingNow(customerId: string): Promise<string | null> {
    const pending = await this.stripe.invoiceItems.list({ customer: customerId, pending: true, limit: 100 });
    if (pending.data.length === 0) return null;
    // Checkout saves the card on the subscription, not the customer: charge the same card.
    const [latest] = (await this.stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 })).data;
    const card = idOf(latest?.default_payment_method ?? null);
    const key = createHash("sha256")
      .update(pending.data.map((item) => item.id).sort().join(","))
      .digest("hex")
      .slice(0, 32);
    const invoice = await this.stripe.invoices.create(
      {
        customer: customerId,
        collection_method: "charge_automatically",
        pending_invoice_items_behavior: "include",
        auto_advance: true,
        description: "Completed fills not yet invoiced",
        ...(card ? { default_payment_method: card } : {}),
      },
      { idempotencyKey: `fills-now-${key}` },
    );
    if (!invoice.id) throw AppError.internal(new Error("Stripe returned no invoice id"));
    await this.stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: true });
    return invoice.id;
  }

  async reverseFillCharge(input: ReverseFillChargeInput): Promise<"removed" | "credited"> {
    const item = await this.stripe.invoiceItems.retrieve(input.invoiceItemId);
    if (!item.invoice) {
      await this.stripe.invoiceItems.del(input.invoiceItemId);
      return "removed";
    }
    // Invoiced already: a credit on the customer's balance comes off their next invoice.
    await this.stripe.customers.createBalanceTransaction(
      input.customerId,
      { amount: -input.amountCents, currency: "usd", description: input.description },
      { idempotencyKey: input.idempotencyKey },
    );
    return "credited";
  }

  async parseWebhookEvent(rawBody: string, signature: string | null): Promise<PaymentEvent> {
    if (!signature) throw AppError.validation("Missing Stripe signature");
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        this.config.webhookSecret,
      );
    } catch (error) {
      throw new AppError("VALIDATION", "Invalid Stripe signature", { cause: error });
    }
    return reduceEvent(event);
  }
}

/** The Stripe client the app uses, pinned to the SDK's API version. */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { appInfo: { name: "FleetGrid" } });
}
