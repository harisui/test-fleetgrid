import { SUBSCRIPTION_RECHECK_HOURS } from "@/lib/constants";
import { AppError } from "@/server/errors/AppError";
import {
  isSubscriptionEventType,
  type IPaymentProvider,
  type SubscriptionSnapshot,
} from "@/server/providers/PaymentProvider";
import type { ICarrierRepository } from "@/server/repositories/CarrierRepository";
import {
  isAccessStatus,
  type ISubscriptionRepository,
} from "@/server/repositories/SubscriptionRepository";
import type { IWebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import type { CarrierAccess, CarrierService } from "@/server/services/CarrierService";
import type { Carrier, Subscription } from "@/types/domain";

const RECHECK_MS = SUBSCRIPTION_RECHECK_HOURS * 3_600_000;

/**
 * True when the stored subscription should be read from Stripe again: it was last written
 * more than SUBSCRIPTION_RECHECK_HOURS ago, or its paid period has ended and nothing has
 * said whether the renewal went through. Null (never paid) needs nothing.
 */
export function isSubscriptionStale(subscription: Subscription | null, now: Date): boolean {
  if (!subscription) return false;
  if (Date.parse(subscription.updatedAt) + RECHECK_MS < now.getTime()) return true;
  return (
    isAccessStatus(subscription.status) &&
    subscription.currentPeriodEnd !== null &&
    Date.parse(subscription.currentPeriodEnd) < now.getTime()
  );
}

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

/** What the reconcile did, for its log line. */
export interface ReconcileOutcome {
  /** Carriers with a Stripe customer. */
  carriers: number;
  /** Those whose subscription was stale and was read from Stripe. */
  checked: number;
  /** Those whose stored status changed. */
  changed: number;
  /** Those the provider could not be asked about (logged, left as they were). */
  failed: number;
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
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getBilling(userId: string): Promise<BillingView> {
    return this.toBilling(await this.carrierService.getAccess(userId));
  }

  /**
   * Whether the access just read should be checked against Stripe before it is trusted: the
   * carrier has paid at some point and the stored subscription is stale (see
   * isSubscriptionStale). The page guard calls refreshAccess when this is true, so a webhook
   * that never arrived (a cancellation, a declined renewal) still closes or opens the search
   * within SUBSCRIPTION_RECHECK_HOURS of the carrier's next visit.
   */
  needsRecheck(access: CarrierAccess): boolean {
    return (
      access.carrier?.stripeCustomerId != null && isSubscriptionStale(access.subscription, this.now())
    );
  }

  /**
   * Reads the carrier's subscription from the payment provider, stores it and returns the
   * access decided from it. The webhook stays the main path; this covers a webhook that is
   * late, misconfigured or lost, so a carrier who paid is never left locked out and a
   * cancellation is never missed for long. A provider failure is logged and the stored state
   * is returned.
   */
  async refreshAccess(userId: string): Promise<CarrierAccess> {
    const carrier = await this.carrierService.getCarrier(userId);
    if (carrier?.stripeCustomerId) {
      try {
        await this.pullFromProvider(carrier);
      } catch (error) {
        this.log("Could not read the subscription from the payment provider", error);
      }
    }
    return this.carrierService.getAccess(userId);
  }

  /** refreshAccess as the billing page shows it. */
  async syncFromProvider(userId: string): Promise<BillingView> {
    return this.toBilling(await this.refreshAccess(userId));
  }

  /**
   * The scheduled pass over every carrier with a Stripe customer: those whose stored
   * subscription is stale (or who have none) are read from Stripe and stored. It runs with
   * the service role, with no carrier signed in, so a cancellation or a declined renewal is
   * recorded even for a carrier who never opens the app again.
   */
  async reconcileAll(): Promise<ReconcileOutcome> {
    const carriers = await this.privileged.carriers().listWithStripeCustomer();
    const subscriptions = this.privileged.subscriptions();
    const outcome: ReconcileOutcome = { carriers: carriers.length, checked: 0, changed: 0, failed: 0 };
    for (const carrier of carriers) {
      const before = await subscriptions.findCurrentByCarrierId(carrier.id);
      if (before && !isSubscriptionStale(before, this.now())) continue;
      outcome.checked += 1;
      try {
        const after = await this.pullFromProvider(carrier);
        if (after?.status !== before?.status) outcome.changed += 1;
      } catch (error) {
        outcome.failed += 1;
        this.log(`Could not reconcile the subscription of carrier ${carrier.id}`, error);
      }
    }
    return outcome;
  }

  /**
   * Stores what the provider holds for the carrier: the newest subscription that grants
   * access, or else the newest. Returns it, or null when the customer has none yet.
   */
  private async pullFromProvider(carrier: Carrier): Promise<SubscriptionSnapshot | null> {
    if (!carrier.stripeCustomerId) return null;
    const snapshots = await this.payments.listSubscriptions(carrier.stripeCustomerId);
    const current = snapshots.find((s) => isAccessStatus(s.status)) ?? snapshots[0] ?? null;
    if (current) await this.privileged.subscriptions().upsert({ carrierId: carrier.id, ...current });
    return current;
  }

  private toBilling(access: CarrierAccess): BillingView {
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
    } else {
      // Checkout pre-fills the email from the Stripe customer, so a billing email changed
      // since the first visit must reach Stripe before each new session.
      await this.payments.updateCustomer(customerId, {
        email: access.carrier.billingEmail,
        name: access.carrier.companyName,
      });
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
    // Receipts and the portal show the customer's email: keep it the carrier's current one.
    await this.payments.updateCustomer(carrier.stripeCustomerId, {
      email: carrier.billingEmail,
      name: carrier.companyName,
    });
    const url = await this.payments.createPortalSession({
      customerId: carrier.stripeCustomerId,
      returnUrl: `${this.appUrl}/carrier/billing`,
    });
    return { url };
  }

  /**
   * A Stripe event. The signature is checked first, the event id is recorded so a replay
   * does nothing, then the subscription it concerns is fetched from the provider and written
   * as a whole. The event's own copy of the subscription is not used: Stripe does not
   * deliver events in order, so an old "created: incomplete" arriving after "updated:
   * active" must not roll access back; the provider's current state is always right. A
   * failure after the record is undone, so Stripe's retry is processed.
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
      const subscriptionId = event.subscription?.stripeSubscriptionId ?? event.subscriptionId;
      if (!subscriptionId) return { handled: false, duplicate: false, reason: "no_subscription" };
      return await this.applySnapshot(await this.payments.getSubscription(subscriptionId));
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
