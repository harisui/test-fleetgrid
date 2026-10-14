import { AppError } from "@/server/errors/AppError";
import {
  isSubscriptionEventType,
  type IPaymentProvider,
  type SubscriptionSnapshot,
} from "@/server/providers/PaymentProvider";
import type { ICarrierRepository } from "@/server/repositories/CarrierRepository";
import type { ISubscriptionRepository } from "@/server/repositories/SubscriptionRepository";
import type { IWebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import type { CarrierService } from "@/server/services/CarrierService";
import type { Subscription } from "@/types/domain";

export interface WebhookOutcome {
  /** True when the event changed a subscription. */
  handled: boolean;
  /** True when the same event had been processed before. */
  duplicate: boolean;
  /** Why an event was acknowledged without a change. */
  reason?: "ignored_type" | "no_subscription" | "unknown_customer";
}

export interface BillingView {
  subscription: Subscription | null;
  subscribed: boolean;
  /** True once a Stripe customer exists, so the portal can open. */
  portalAvailable: boolean;
  /** Whether the test checkout page, not Stripe, handles payment. */
  testMode: boolean;
}

/** The repositories the webhook writes with: they need the service role, so they are built on demand. */
export interface PrivilegedBillingRepositories {
  carriers: () => ICarrierRepository;
  subscriptions: () => ISubscriptionRepository;
  webhookEvents: () => IWebhookEventRepository;
}

/**
 * The paywall: starts Stripe Checkout, opens the Customer Portal and keeps the
 * subscriptions table in step with Stripe's webhooks. Access itself is decided by the
 * database (RLS) and CarrierService.getAccess from what this writes.
 */
export class SubscriptionService {
  constructor(
    private readonly carrierService: CarrierService,
    private readonly subscriptions: ISubscriptionRepository,
    private readonly privileged: PrivilegedBillingRepositories,
    private readonly payments: IPaymentProvider,
    private readonly appUrl: string,
    private readonly log: (message: string, detail?: unknown) => void = () => undefined,
  ) {}

  async getBilling(userId: string): Promise<BillingView> {
    const access = await this.carrierService.getAccess(userId);
    return {
      subscription: access.subscription,
      subscribed: access.subscribed,
      portalAvailable: access.carrier?.stripeCustomerId !== null && access.carrier !== null,
      testMode: this.payments.mode === "test",
    };
  }

  /**
   * Sends the carrier to pay. Needs the Terms accepted and a yard inside a launch area;
   * a carrier who already has access is sent back to the search instead.
   */
  async startCheckout(userId: string): Promise<{ url: string }> {
    const access = await this.carrierService.getAccess(userId);
    if (!access.carrier) throw AppError.notFound("Save your company details first");
    if (!access.termsAccepted) throw AppError.forbidden("Accept the Terms of Service first");
    if (access.subscribed) throw AppError.conflict("You already have an active subscription");
    if (!access.carrier.inServiceArea) {
      throw AppError.forbidden("FleetGrid isn't available in your area yet");
    }

    let customerId = access.carrier.stripeCustomerId;
    if (!customerId) {
      customerId = await this.payments.createCustomer({
        email: access.carrier.billingEmail,
        name: access.carrier.companyName,
        carrierId: access.carrier.id,
      });
      await this.privileged.carriers().update(access.carrier.id, { stripeCustomerId: customerId });
    }

    const url = await this.payments.createCheckoutSession({
      customerId,
      carrierId: access.carrier.id,
      successUrl: `${this.appUrl}/carrier/billing?checkout=success`,
      cancelUrl: `${this.appUrl}/carrier/billing?checkout=cancelled`,
    });
    return { url };
  }

  /** Opens the hosted page where the carrier changes their card or cancels. */
  async openBillingPortal(userId: string): Promise<{ url: string }> {
    const carrier = await this.carrierService.getCarrier(userId);
    if (!carrier) throw AppError.notFound("Save your company details first");
    if (!carrier.stripeCustomerId) {
      throw AppError.validation("Subscribe first; there is no billing account yet");
    }
    const url = await this.payments.createPortalSession({
      customerId: carrier.stripeCustomerId,
      returnUrl: `${this.appUrl}/carrier/billing`,
    });
    return { url };
  }

  /**
   * A Stripe event. The signature is checked first, the event id is recorded so a replay
   * does nothing, then the subscription it concerns is fetched (when the event carries only
   * an id) and written as a whole. A failure after the record is undone, so Stripe's retry
   * is processed.
   */
  async handleWebhook(rawBody: string, signature: string | null): Promise<WebhookOutcome> {
    const event = await this.payments.parseWebhookEvent(rawBody, signature);
    if (!isSubscriptionEventType(event.type)) {
      return { handled: false, duplicate: false, reason: "ignored_type" };
    }

    const events = this.privileged.webhookEvents();
    const isNew = await events.recordOnce({
      provider: this.payments.mode,
      eventId: event.id,
      type: event.type,
    });
    if (!isNew) return { handled: false, duplicate: true };

    try {
      const snapshot =
        event.subscription ??
        (event.subscriptionId ? await this.payments.getSubscription(event.subscriptionId) : null);
      if (!snapshot) return { handled: false, duplicate: false, reason: "no_subscription" };
      return await this.applySnapshot(snapshot);
    } catch (error) {
      await events.forget(this.payments.mode, event.id).catch(() => undefined);
      throw error;
    }
  }

  /** Test mode only: the test checkout page's Pay button. Does what a paid checkout's webhook would. */
  async completeTestCheckout(userId: string, customerId: unknown): Promise<Subscription> {
    if (!this.payments.simulateCheckoutPaid) {
      throw AppError.forbidden("Test checkout is not available");
    }
    const carrier = await this.carrierService.getCarrier(userId);
    if (!carrier || !carrier.stripeCustomerId || carrier.stripeCustomerId !== customerId) {
      throw AppError.forbidden("This checkout is not yours");
    }
    const snapshot = await this.payments.simulateCheckoutPaid(carrier.stripeCustomerId);
    return this.privileged.subscriptions().upsert({ carrierId: carrier.id, ...snapshot });
  }

  /** Stops billing before an account is deleted, so a removed carrier is never charged again. */
  async cancelForAccountDeletion(userId: string): Promise<void> {
    const carrier = await this.carrierService.getCarrier(userId).catch(() => null);
    if (!carrier) return;
    const subscription = await this.subscriptions.findActiveByCarrierId(carrier.id);
    if (!subscription) return;
    await this.payments.cancelSubscription(subscription.stripeSubscriptionId);
  }

  private async applySnapshot(snapshot: SubscriptionSnapshot): Promise<WebhookOutcome> {
    const carrier = await this.privileged.carriers().findByStripeCustomerId(snapshot.stripeCustomerId);
    if (!carrier) {
      this.log("Stripe event for an unknown customer", snapshot.stripeCustomerId);
      return { handled: false, duplicate: false, reason: "unknown_customer" };
    }
    await this.privileged.subscriptions().upsert({ carrierId: carrier.id, ...snapshot });
    return { handled: true, duplicate: false };
  }
}
