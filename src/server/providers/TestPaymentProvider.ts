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

/** A fill charge as the test provider keeps it: pending until an invoice takes it. */
export interface TestInvoiceItem {
  id: string;
  customerId: string;
  amountCents: number;
  description: string;
  metadata: Record<string, string>;
  invoiceId: string | null;
}

/** The path of the in-app page that stands in for Stripe Checkout in test mode. */
export const TEST_CHECKOUT_PATH = "/carrier/billing/test-checkout";

/**
 * An in-memory payment provider for local development, the unit tests and the browser
 * tests. Checkout sends the carrier to a page inside the app with a "Pay" button; paying
 * creates an active subscription the same way a Stripe webhook would. It is wired in only
 * when ENABLE_TEST_LOGIN is on and no Stripe key is set, so production never sees it.
 */
export class TestPaymentProvider implements IPaymentProvider {
  readonly mode = "test" as const;
  readonly customers = new Map<string, CreateCustomerInput>();
  readonly subscriptions = new Map<string, SubscriptionSnapshot>();
  readonly checkouts: CheckoutSessionInput[] = [];
  readonly portals: PortalSessionInput[] = [];
  readonly cancelled: string[] = [];
  /** Events parseWebhookEvent returns, keyed by the signature a test sends. */
  readonly events = new Map<string, PaymentEvent>();
  readonly invoiceItems = new Map<string, TestInvoiceItem>();
  /** The card each customer pays with, by fingerprint. Defaults to one card per customer. */
  readonly cardFingerprints = new Map<string, string>();
  /**
   * Customer ids restart at cus_test_0001 with every server process, but the database keeps the
   * cards that had a trial. A token per process keeps one run's default card from looking like a
   * card an earlier run already used.
   */
  readonly cardSeed = Math.random().toString(36).slice(2, 10);
  readonly invoices: { id: string; customerId: string; itemIds: string[] }[] = [];
  readonly credits: { customerId: string; amountCents: number; description: string }[] = [];
  private readonly idempotency = new Map<string, string>();
  private sequence = 0;

  constructor(
    private readonly appUrl: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_test_${String(this.sequence).padStart(4, "0")}`;
  }

  async createCustomer(input: CreateCustomerInput): Promise<string> {
    const id = this.nextId("cus");
    this.customers.set(id, input);
    return id;
  }

  async updateCustomer(customerId: string, input: { email: string; name: string }): Promise<void> {
    const customer = this.customers.get(customerId);
    if (!customer) throw AppError.notFound("Unknown customer");
    this.customers.set(customerId, { ...customer, ...input });
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<string> {
    if (!this.customers.has(input.customerId)) throw AppError.notFound("Unknown customer");
    this.checkouts.push(input);
    const url = new URL(TEST_CHECKOUT_PATH, this.appUrl);
    url.searchParams.set("customer", input.customerId);
    return url.toString();
  }

  async createPortalSession(input: PortalSessionInput): Promise<string> {
    this.portals.push(input);
    return input.returnUrl;
  }

  async getSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw AppError.notFound("Unknown subscription");
    return subscription;
  }

  async listSubscriptions(customerId: string): Promise<SubscriptionSnapshot[]> {
    return [...this.subscriptions.values()]
      .filter((subscription) => subscription.stripeCustomerId === customerId)
      .reverse();
  }

  async resumeSubscription(subscriptionId: string): Promise<SubscriptionSnapshot> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw AppError.notFound("Unknown subscription");
    const resumed = { ...subscription, cancelAtPeriodEnd: false, canceledAt: null };
    this.subscriptions.set(subscriptionId, resumed);
    return resumed;
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;
    this.cancelled.push(subscriptionId);
    this.subscriptions.set(subscriptionId, {
      ...subscription,
      status: "canceled",
      canceledAt: this.now().toISOString(),
    });
  }

  async createFillCharge(input: FillChargeInput): Promise<string> {
    if (!this.customers.has(input.customerId)) throw AppError.notFound("Unknown customer");
    const known = this.idempotency.get(input.idempotencyKey);
    if (known) return known;
    const id = this.nextId("ii");
    this.invoiceItems.set(id, {
      id,
      customerId: input.customerId,
      amountCents: input.amountCents,
      description: input.description,
      metadata: input.metadata,
      invoiceId: null,
    });
    this.idempotency.set(input.idempotencyKey, id);
    return id;
  }

  /** The pending items of a customer, as the next invoice would take them. */
  pendingItems(customerId: string): TestInvoiceItem[] {
    return [...this.invoiceItems.values()].filter((item) => item.customerId === customerId && item.invoiceId === null);
  }

  async invoicePendingNow(customerId: string): Promise<string | null> {
    const pending = this.pendingItems(customerId);
    if (pending.length === 0) return null;
    const id = this.nextId("in");
    for (const item of pending) item.invoiceId = id;
    this.invoices.push({ id, customerId, itemIds: pending.map((item) => item.id) });
    return id;
  }

  async reverseFillCharge(input: ReverseFillChargeInput): Promise<"removed" | "credited"> {
    const known = this.idempotency.get(input.idempotencyKey);
    if (known) return known as "removed" | "credited";
    const item = this.invoiceItems.get(input.invoiceItemId);
    let outcome: "removed" | "credited";
    if (item && item.invoiceId === null) {
      this.invoiceItems.delete(item.id);
      outcome = "removed";
    } else {
      this.credits.push({ customerId: input.customerId, amountCents: input.amountCents, description: input.description });
      outcome = "credited";
    }
    this.idempotency.set(input.idempotencyKey, outcome);
    return outcome;
  }

  async parseWebhookEvent(rawBody: string, signature: string | null): Promise<PaymentEvent> {
    const event = signature ? this.events.get(signature) : undefined;
    if (!event) throw AppError.validation("Invalid Stripe signature");
    void rawBody;
    return event;
  }

  async trialCardFingerprint(subscriptionId: string): Promise<string | null> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw AppError.notFound("Unknown subscription");
    return this.cardFingerprints.get(subscription.stripeCustomerId) ?? `fp_test_${this.cardSeed}_${subscription.stripeCustomerId}`;
  }

  async endTrialNow(subscriptionId: string): Promise<SubscriptionSnapshot> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw AppError.notFound("Unknown subscription");
    const now = this.now();
    const ended: SubscriptionSnapshot = {
      ...subscription,
      status: "active",
      trialEnd: now.toISOString(),
      currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
    };
    this.subscriptions.set(subscriptionId, ended);
    return ended;
  }

  /**
   * The carrier pressed Pay on the test checkout page: the trial their last checkout offered
   * starts now, or, without one, a paid month.
   */
  async simulateCheckoutPaid(customerId: string): Promise<SubscriptionSnapshot> {
    if (!this.customers.has(customerId)) throw AppError.notFound("Unknown customer");
    const trialDays = this.checkouts.filter((checkout) => checkout.customerId === customerId).at(-1)?.trialDays ?? null;
    const now = this.now();
    const periodEnd = new Date(now.getTime() + (trialDays ?? 30) * 86_400_000);
    const subscription: SubscriptionSnapshot = {
      stripeSubscriptionId: this.nextId("sub"),
      stripeCustomerId: customerId,
      status: trialDays ? "trialing" : "active",
      priceId: "price_test_monthly",
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialStart: trialDays ? now.toISOString() : null,
      trialEnd: trialDays ? periodEnd.toISOString() : null,
    };
    this.subscriptions.set(subscription.stripeSubscriptionId, subscription);
    return subscription;
  }
}
