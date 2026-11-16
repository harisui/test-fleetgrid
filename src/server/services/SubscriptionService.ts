import { BILLING_DISCLOSURE_VERSION, SUBSCRIPTION_RECHECK_HOURS, TRIAL_DAYS } from "@/lib/constants";
import { priceDisclosureDocument, trialDateKey, trialDateLabel } from "@/lib/carrier/options";
import { PRICING_CHANGED_MESSAGE, startCheckoutSchema } from "@/lib/validation/carrier.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import {
  isSubscriptionEventType,
  type IPaymentProvider,
  type SubscriptionSnapshot,
} from "@/server/providers/PaymentProvider";
import type { IBillingAcknowledgmentRepository, ITrialCardRepository } from "@/server/repositories/BillingRecordRepository";
import type { ICarrierRepository } from "@/server/repositories/CarrierRepository";
import type { IFillRepository } from "@/server/repositories/FillRepository";
import {
  isAccessStatus,
  type ISubscriptionRepository,
} from "@/server/repositories/SubscriptionRepository";
import type { IWebhookEventRepository } from "@/server/repositories/WebhookEventRepository";
import type { CarrierAccess, CarrierService } from "@/server/services/CarrierService";
import type { Carrier, Subscription, SubscriptionStatus } from "@/types/domain";

/** A subscription in one of these has ended for good: its pending fills are invoiced at once. */
const ENDED_STATUSES: readonly SubscriptionStatus[] = ["canceled", "incomplete_expired"];
const isEnded = (status: SubscriptionStatus | undefined): boolean => status !== undefined && ENDED_STATUSES.includes(status);

const RECHECK_MS = SUBSCRIPTION_RECHECK_HOURS * 3_600_000;

/**
 * The 7-day trial goes to a carrier who has never subscribed: no trial on record and no
 * subscription of any status (one that subscribed before the trial existed gets none).
 */
const trialOffered = (access: CarrierAccess): boolean =>
  access.carrier !== null && access.carrier.trialUsedAt === null && access.subscription === null;

/** The same day and time one calendar month earlier, as Stripe counts a monthly period. */
function monthBefore(iso: string): string {
  const date = new Date(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

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
  /** True while the carrier has never had a trial: checkout starts the 7-day one. */
  trialAvailable: boolean;
  /** When a trial started now would end (for the disclosure), or null with no trial left. */
  trialWouldEnd: string | null;
  /** The completed fills of the current billing period, once subscribed. */
  fills: FillSummary | null;
}

/** The completed fills since the current period (or the trial) began. */
export interface FillSummary {
  since: string;
  included: number;
  billable: number;
  waived: number;
  billableCents: number;
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
  /** Card fingerprints that had a trial (service role). */
  trialCards: () => ITrialCardRepository;
}

/** The pricing pieces (2026-11-11): the price acknowledgment and the fills owed when a plan ends. */
export interface BillingHooks {
  /** As the signed-in carrier. */
  acknowledgments: () => IBillingAcknowledgmentRepository;
  /** Bills the carrier's unbilled fills and invoices everything pending (FillService.closeOut). */
  closeOutFills: (carrierId: string) => Promise<void>;
  /** As the signed-in carrier (RLS: their own fills). */
  fills: () => IFillRepository;
}

/** Where the checkout request came from, kept with the acknowledgment. */
export interface CheckoutContext {
  ip: string | null;
  userAgent: string | null;
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
    private readonly billing: BillingHooks,
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
    return current ? this.store(carrier, current) : null;
  }

  private async toBilling(access: CarrierAccess): Promise<BillingView> {
    const trialAvailable = trialOffered(access);
    return {
      subscription: access.subscription,
      subscribed: access.subscribed,
      portalAvailable: access.carrier?.stripeCustomerId !== null && access.carrier !== null,
      testMode: this.payments.mode === "test",
      trialAvailable,
      trialWouldEnd: trialAvailable ? new Date(this.now().getTime() + TRIAL_DAYS * 86_400_000).toISOString() : null,
      fills: access.carrier && access.subscribed && access.subscription ? await this.fillSummary(access.carrier.id, access.subscription) : null,
    };
  }

  /** Since the trial began while trialing, else since the start of the paid month. */
  private async fillSummary(carrierId: string, subscription: Subscription): Promise<FillSummary> {
    const since =
      subscription.status === "trialing" && subscription.trialStart
        ? subscription.trialStart
        : subscription.currentPeriodEnd
          ? monthBefore(subscription.currentPeriodEnd)
          : subscription.createdAt;
    const fills = await this.billing.fills().listForCarrier(carrierId, since);
    const count = (charge: string) => fills.filter((fill) => fill.charge === charge).length;
    return {
      since,
      included: count("included"),
      billable: count("billable"),
      waived: count("waived"),
      billableCents: fills.filter((fill) => fill.charge === "billable").reduce((sum, fill) => sum + fill.amountCents, 0),
    };
  }

  /**
   * Sends the carrier to pay. Needs the Terms accepted, a yard inside a launch area and the
   * price disclosure acknowledged (recorded with the version, address and browser); a
   * carrier who already has access is sent back to the search instead. A carrier who has
   * never had a trial gets the 7-day one; the card is taken either way.
   */
  async startCheckout(userId: string, input: unknown, context: CheckoutContext): Promise<{ url: string }> {
    const { trialEndsOn } = parseInput(startCheckoutSchema, input);
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

    const trialDays = trialOffered(access) ? TRIAL_DAYS : null;
    // The archive must hold the text the carrier read: the server builds it again from the trial
    // date the page showed, and refuses when that date is no longer today's (attorney, 2026-11-14).
    const trialEnd = trialDays !== null ? new Date(this.now().getTime() + trialDays * 86_400_000).toISOString() : null;
    if ((trialEnd === null) !== (trialEndsOn === null) || (trialEnd !== null && trialDateKey(trialEnd) !== trialEndsOn)) {
      throw AppError.conflict(PRICING_CHANGED_MESSAGE);
    }
    const disclosure = priceDisclosureDocument(trialEnd ? { firstCharge: trialDateLabel(trialEnd) } : null);
    await this.billing.acknowledgments().record({
      version: BILLING_DISCLOSURE_VERSION,
      withTrial: trialDays !== null,
      disclosure: disclosure.body,
      statement: disclosure.statement,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const url = await this.payments.createCheckoutSession({
      customerId,
      carrierId: access.carrier.id,
      trialDays,
      successUrl: `${this.appUrl}/carrier/billing?checkout=success`,
      cancelUrl: `${this.appUrl}/carrier/billing?checkout=cancelled`,
    });
    return { url };
  }

  /**
   * The carrier set their subscription to end at the period end and has changed their
   * mind: the scheduled cancellation is cleared at the provider and the stored row follows.
   */
  async keepSubscription(userId: string): Promise<Subscription> {
    const carrier = await this.carrierService.getCarrier(userId);
    if (!carrier) throw AppError.notFound("Save your company details first");
    const current = await this.subscriptions.findActiveByCarrierId(carrier.id);
    if (!current) throw AppError.validation("There is no subscription to keep. Subscribe to open driver search.");
    if (!current.cancelAtPeriodEnd) throw AppError.validation("Your subscription is not set to end.");
    const snapshot = await this.payments.resumeSubscription(current.stripeSubscriptionId);
    return this.privileged.subscriptions().upsert({ carrierId: carrier.id, ...snapshot });
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
    const stored = await this.store(carrier, snapshot);
    const subscription = await this.privileged.subscriptions().findByStripeId(stored.stripeSubscriptionId);
    if (!subscription) throw AppError.internal(new Error("The test subscription was not stored"));
    return subscription;
  }

  /** Stops billing before an account is deleted, so a removed carrier is never charged again. */
  async cancelForAccountDeletion(userId: string): Promise<void> {
    const carrier = await this.carrierService.getCarrier(userId).catch(() => null);
    if (!carrier) return;
    // The fills owed are invoiced first: once the account is gone no event can find the carrier.
    await this.billing.closeOutFills(carrier.id).catch((error: unknown) => {
      this.log(`Could not invoice the pending fills of carrier ${carrier.id} before deletion`, error);
    });
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
    await this.store(carrier, snapshot);
    return { handled: true, duplicate: false };
  }

  /**
   * Writes what the provider holds, with the pricing rules on the way:
   * - a subscription that has just ended has its pending fills invoiced first, so a failure
   *   leaves it unstored and the next event or reconcile tries again;
   * - a trial is one per carrier and one per card: the first trial is recorded, and a second
   *   one (another checkout, or a card that had a trial) is ended at once, which takes the
   *   first monthly charge now.
   * Returns the snapshot as stored.
   */
  private async store(carrier: Carrier, snapshot: SubscriptionSnapshot): Promise<SubscriptionSnapshot> {
    const subscriptions = this.privileged.subscriptions();
    if (isEnded(snapshot.status)) {
      const before = await subscriptions.findByStripeId(snapshot.stripeSubscriptionId);
      if (!isEnded(before?.status)) await this.billing.closeOutFills(carrier.id);
    }
    const stored = snapshot.status === "trialing" && snapshot.trialStart ? await this.secureTrial(carrier, snapshot) : snapshot;
    await subscriptions.upsert({ carrierId: carrier.id, ...stored });
    return stored;
  }

  private async secureTrial(carrier: Carrier, snapshot: SubscriptionSnapshot): Promise<SubscriptionSnapshot> {
    const trialStart = snapshot.trialStart as string;
    const current = (await this.privileged.carriers().findById(carrier.id)) ?? carrier;
    const sameTrial = current.trialUsedAt !== null && Date.parse(current.trialUsedAt) === Date.parse(trialStart);
    if (current.trialUsedAt !== null && !sameTrial) {
      this.log(`Carrier ${carrier.id} had a trial already: the new one ends now`);
      return this.payments.endTrialNow(snapshot.stripeSubscriptionId);
    }
    const fingerprint = await this.payments.trialCardFingerprint(snapshot.stripeSubscriptionId);
    if (fingerprint && !(await this.privileged.trialCards().claim(fingerprint, carrier.id))) {
      this.log(`The card of carrier ${carrier.id} had a trial with another carrier: the trial ends now`);
      if (current.trialUsedAt === null) await this.privileged.carriers().update(carrier.id, { trialUsedAt: trialStart });
      return this.payments.endTrialNow(snapshot.stripeSubscriptionId);
    }
    if (current.trialUsedAt === null) await this.privileged.carriers().update(carrier.id, { trialUsedAt: trialStart });
    return snapshot;
  }
}
