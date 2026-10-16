import "server-only";
import type { ServerEnv } from "@/lib/env";
import { AppError } from "@/server/errors/AppError";
import type { IPaymentProvider, PaymentEvent, SubscriptionSnapshot } from "@/server/providers/PaymentProvider";
import { createStripeClient, StripeProvider } from "@/server/providers/StripeProvider";
import { TestPaymentProvider } from "@/server/providers/TestPaymentProvider";

const NOT_CONFIGURED = "Payments are not set up yet. Contact support for help.";

/** Stands in until the Stripe keys exist: every call fails with one plain message. */
class UnconfiguredPaymentProvider implements IPaymentProvider {
  readonly mode = "stripe" as const;
  private async fail(): Promise<never> {
    throw new AppError("INTERNAL", NOT_CONFIGURED);
  }
  createCustomer(): Promise<string> {
    return this.fail();
  }
  createCheckoutSession(): Promise<string> {
    return this.fail();
  }
  createPortalSession(): Promise<string> {
    return this.fail();
  }
  getSubscription(): Promise<SubscriptionSnapshot> {
    return this.fail();
  }
  cancelSubscription(): Promise<void> {
    return this.fail();
  }
  parseWebhookEvent(): Promise<PaymentEvent> {
    return this.fail();
  }
}

/** One provider per server process: the test one keeps its customers in memory. */
let provider: IPaymentProvider | undefined;

/**
 * Stripe when its keys are set. The in-memory test provider when the test-login flag is on
 * and no Stripe key exists (local development and the browser tests; production refuses the
 * flag). Otherwise a provider that says payments are not set up.
 */
export function getPaymentProvider(env: ServerEnv): IPaymentProvider {
  provider ??= createPaymentProvider(env);
  return provider;
}

export function createPaymentProvider(env: ServerEnv): IPaymentProvider {
  // The browser tests' switch: the test checkout wins over Stripe, but only where test
  // login is on (never in production against a hosted project, see env.ts).
  if (env.ENABLE_TEST_LOGIN && env.PAYMENT_TEST_MODE) {
    return new TestPaymentProvider(env.NEXT_PUBLIC_APP_URL);
  }
  if (env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID_MONTHLY && env.STRIPE_WEBHOOK_SECRET) {
    return new StripeProvider(createStripeClient(env.STRIPE_SECRET_KEY), {
      priceId: env.STRIPE_PRICE_ID_MONTHLY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    });
  }
  if (env.ENABLE_TEST_LOGIN && !env.STRIPE_SECRET_KEY) {
    return new TestPaymentProvider(env.NEXT_PUBLIC_APP_URL);
  }
  return new UnconfiguredPaymentProvider();
}
