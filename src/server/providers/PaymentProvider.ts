import type { SubscriptionStatus } from "@/types/domain";

/** What the app keeps of a subscription, as the provider reports it. */
export interface SubscriptionSnapshot {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: SubscriptionStatus;
  priceId: string | null;
  /** ISO timestamp of the end of the paid period, or null when unknown. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  /** The trial window, when the subscription had one. */
  trialStart: string | null;
  trialEnd: string | null;
}

/** One completed fill to charge: a pending item on the customer, picked up by their next invoice. */
export interface FillChargeInput {
  customerId: string;
  amountCents: number;
  description: string;
  /** The same key twice returns the first item: a re-run never charges twice. */
  idempotencyKey: string;
  metadata: Record<string, string>;
}

/** Takes back one fill's charge (an admin waive). */
export interface ReverseFillChargeInput {
  customerId: string;
  invoiceItemId: string;
  amountCents: number;
  description: string;
  idempotencyKey: string;
}

/** A verified provider event, reduced to what the subscription service acts on. */
export interface PaymentEvent {
  id: string;
  type: string;
  /** The subscription the event is about, when the event carries only its id. */
  subscriptionId: string | null;
  /** The subscription itself, when the event carries the whole object. */
  subscription: SubscriptionSnapshot | null;
}

export interface CreateCustomerInput {
  email: string;
  name: string;
  carrierId: string;
}

export interface CheckoutSessionInput {
  customerId: string;
  carrierId: string;
  successUrl: string;
  cancelUrl: string;
  /** Days of trial (card still required), or null when the carrier has had their trial. */
  trialDays: number | null;
}

export interface PortalSessionInput {
  customerId: string;
  returnUrl: string;
}

/**
 * The payment provider as the services see it: Stripe in production, an in-memory one for
 * local development and the browser tests. Every method returns plain data; no provider
 * object leaks into the services.
 */
export interface IPaymentProvider {
  readonly mode: "stripe" | "test";
  createCustomer(input: CreateCustomerInput): Promise<string>;
  /**
   * Brings an existing customer's email and name up to date. Stripe pre-fills checkout and
   * sends receipts from the customer record, so it must follow the carrier's billing email.
   */
  updateCustomer(customerId: string, input: Pick<CreateCustomerInput, "email" | "name">): Promise<void>;
  /** The URL the carrier is sent to for payment. */
  createCheckoutSession(input: CheckoutSessionInput): Promise<string>;
  /** The URL of the hosted page where the carrier manages their card and plan. */
  createPortalSession(input: PortalSessionInput): Promise<string>;
  getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot>;
  /**
   * The customer's subscriptions, newest first, whatever their status. Lets the app read the
   * state from the provider itself when a webhook is late or never arrives.
   */
  listSubscriptions(customerId: string): Promise<SubscriptionSnapshot[]>;
  /**
   * Clears a scheduled cancellation (the carrier changed their mind before the paid period
   * ended) and returns the subscription as it stands after.
   */
  resumeSubscription(subscriptionId: string): Promise<SubscriptionSnapshot>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  /** Verifies the signature and reduces the event. Throws a VALIDATION AppError when it is not genuine. */
  parseWebhookEvent(rawBody: string, signature: string | null): Promise<PaymentEvent>;
  /** The fingerprint of the card on the subscription, to allow one trial per card. Never card data. */
  trialCardFingerprint(subscriptionId: string): Promise<string | null>;
  /** Ends a trial at once: the first monthly charge is taken now. Returns the subscription after. */
  endTrialNow(subscriptionId: string): Promise<SubscriptionSnapshot>;
  /** Adds a fill's charge to the customer's next invoice. Returns the invoice item id. */
  createFillCharge(input: FillChargeInput): Promise<string>;
  /**
   * Invoices every pending item of the customer at once (a one-off invoice, charged to the
   * card on file): used when the subscription has ended, so no fill goes unbilled. Null when
   * nothing is pending, so a second call does nothing.
   */
  invoicePendingNow(customerId: string): Promise<string | null>;
  /**
   * Removes a fill's charge still waiting for an invoice, or, once invoiced, credits the
   * amount to the customer's balance (taken off their next invoice).
   */
  reverseFillCharge(input: ReverseFillChargeInput): Promise<"removed" | "credited">;
  /** Test mode only: marks the customer's checkout as paid and returns the subscription. */
  simulateCheckoutPaid?(customerId: string): Promise<SubscriptionSnapshot>;
}

/** The event types the subscription service acts on. Everything else is acknowledged and ignored. */
export const SUBSCRIPTION_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export const isSubscriptionEventType = (type: string): boolean =>
  (SUBSCRIPTION_EVENT_TYPES as readonly string[]).includes(type);
