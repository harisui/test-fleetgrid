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
  cancelSubscription(subscriptionId: string): Promise<void>;
  /** Verifies the signature and reduces the event. Throws a VALIDATION AppError when it is not genuine. */
  parseWebhookEvent(rawBody: string, signature: string | null): Promise<PaymentEvent>;
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
