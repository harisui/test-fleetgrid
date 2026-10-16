import { AppError } from "@/server/errors/AppError";
import type {
  CheckoutSessionInput,
  CreateCustomerInput,
  IPaymentProvider,
  PaymentEvent,
  PortalSessionInput,
  SubscriptionSnapshot,
} from "@/server/providers/PaymentProvider";

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

  async parseWebhookEvent(rawBody: string, signature: string | null): Promise<PaymentEvent> {
    const event = signature ? this.events.get(signature) : undefined;
    if (!event) throw AppError.validation("Invalid Stripe signature");
    void rawBody;
    return event;
  }

  /** The carrier pressed Pay on the test checkout page: a month of access starts now. */
  async simulateCheckoutPaid(customerId: string): Promise<SubscriptionSnapshot> {
    if (!this.customers.has(customerId)) throw AppError.notFound("Unknown customer");
    const periodEnd = new Date(this.now().getTime() + 30 * 86_400_000);
    const subscription: SubscriptionSnapshot = {
      stripeSubscriptionId: this.nextId("sub"),
      stripeCustomerId: customerId,
      status: "active",
      priceId: "price_test_monthly",
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    };
    this.subscriptions.set(subscription.stripeSubscriptionId, subscription);
    return subscription;
  }
}
