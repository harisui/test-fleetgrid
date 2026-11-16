"use client";

import { format } from "date-fns";
import { CalendarClock, CircleCheck, CreditCard, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdsConversion } from "@/components/seo/AdsConversion";
import { ConsentCard } from "@/components/shared/ConsentCard";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  isEnding,
  PLAN,
  priceAcknowledgment,
  priceDisclosure,
  SUBSCRIPTION_ENDING_LABEL,
  SUBSCRIPTION_STATUS_HELP,
  SUBSCRIPTION_STATUS_LABELS,
  trialDateKey,
  trialDateLabel,
  trialStartedNotice,
} from "@/lib/carrier/options";
import { PRICE_ACKNOWLEDGMENT_MESSAGE } from "@/lib/validation/carrier.schema";
import type { FillSummary } from "@/server/services/SubscriptionService";
import {
  keepSubscriptionAction,
  openBillingPortalAction,
  refreshSubscriptionAction,
  startCheckoutAction,
} from "@/server/actions/carrier.actions";
import type { Subscription } from "@/types/domain";

/** After checkout, how often and how many times the page asks whether the subscription is live. */
export const CONFIRM_INTERVAL_MS = 3000;
export const CONFIRM_ATTEMPTS = 20;

interface BillingCardProps {
  subscription: Subscription | null;
  subscribed: boolean;
  portalAvailable: boolean;
  testMode: boolean;
  /** From the URL after checkout: "success" or "cancelled". */
  checkoutResult?: string;
  /** The carrier has never had a trial: checkout starts the 7-day one. */
  trialAvailable: boolean;
  /** When a trial started now would end. */
  trialWouldEnd: string | null;
  /** This period's completed fills, once subscribed. */
  fills: FillSummary | null;
}

const longDate = (iso: string) => format(new Date(iso), "MMMM d, yyyy");

/** The plan, the state of the subscription, and the buttons that start or manage it. */
export function BillingCard({
  subscription,
  subscribed,
  portalAvailable,
  testMode,
  checkoutResult,
  trialAvailable,
  trialWouldEnd,
  fills,
}: BillingCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState<"checkout" | "portal" | "keep">();
  const [error, setError] = useState<string>();
  // The price disclosure must be acknowledged before the card (recorded with the checkout).
  const [acknowledged, setAcknowledged] = useState(false);
  const [ackError, setAckError] = useState<string>();
  // The trial end date in Houston time, the same text the server archives with the checkbox.
  const trial = trialAvailable && trialWouldEnd ? { firstCharge: trialDateLabel(trialWouldEnd) } : null;
  // The carrier cleared a cancellation on this visit: said once, kept through the reload.
  const [kept, setKept] = useState(false);
  const ending = isEnding(subscription, subscribed);
  // Back from a paid checkout but not active yet: ask the provider until it is, then reload.
  const [confirm, setConfirm] = useState<"checking" | "late" | undefined>(
    checkoutResult === "success" && !subscribed ? "checking" : undefined,
  );

  useEffect(() => {
    if (confirm !== "checking" || subscribed) return;
    let stopped = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      attempts += 1;
      const result = await refreshSubscriptionAction();
      if (stopped) return;
      if (result.ok && result.data.subscribed) {
        router.refresh();
        return;
      }
      if (attempts >= CONFIRM_ATTEMPTS) {
        setConfirm("late");
        return;
      }
      timer = setTimeout(check, CONFIRM_INTERVAL_MS);
    };
    timer = setTimeout(check, CONFIRM_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [confirm, subscribed, router]);

  const confirming = confirm === "checking" && !subscribed;

  async function go(kind: "checkout" | "portal") {
    if (kind === "checkout" && !acknowledged) {
      setAckError(PRICE_ACKNOWLEDGMENT_MESSAGE);
      return;
    }
    setPending(kind);
    setError(undefined);
    const result =
      kind === "checkout"
        ? await startCheckoutAction({ acknowledged, trialEndsOn: trial && trialWouldEnd ? trialDateKey(trialWouldEnd) : null })
        : await openBillingPortalAction();
    if (!result.ok) {
      setPending(undefined);
      if (result.error.fieldErrors?.acknowledged) setAckError(result.error.fieldErrors.acknowledged);
      else setError(result.error.message);
      return;
    }
    window.location.assign(result.data.url);
  }

  async function keep() {
    setPending("keep");
    setError(undefined);
    const result = await keepSubscriptionAction();
    setPending(undefined);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setKept(true);
    router.refresh();
  }

  const periodEnd = subscription?.currentPeriodEnd
    ? format(new Date(subscription.currentPeriodEnd), "MMMM d, yyyy")
    : null;

  return (
    <section
      aria-labelledby="billing-title"
      className="flex flex-col gap-5 rounded-card border border-border bg-card p-5"
      data-slot="billing"
    >
      {/* Back from checkout with the payment confirmed: count it for Google Ads, where configured. */}
      {checkoutResult === "success" && subscribed && <AdsConversion event="subscribe" />}
      {checkoutResult === "success" && subscribed && (
        <InlineNote variant="success" data-slot="checkout-result">
          {subscription?.status === "trialing"
            ? subscription.trialEnd
              ? trialStartedNotice(subscription.trialEnd)
              : "Card saved. Thank you. Your 7-day trial has started."
            : "Payment received. Thank you. Your subscription is active."}
        </InlineNote>
      )}
      {confirming && (
        <InlineNote variant="info" role="status" data-slot="checkout-result" data-confirm="checking">
          Payment received. Confirming your subscription with Stripe. This takes a few seconds.
        </InlineNote>
      )}
      {checkoutResult === "success" && !subscribed && confirm === "late" && (
        <InlineNote variant="warning" role="status" data-slot="checkout-result" data-confirm="late">
          <span className="flex flex-col items-start gap-2">
            Stripe has not confirmed your payment yet. Check again in a minute before you try to
            pay again, and contact support if this does not change.
            <Button type="button" variant="link" onClick={() => setConfirm("checking")}>
              Check again
            </Button>
          </span>
        </InlineNote>
      )}
      {checkoutResult === "cancelled" && (
        <InlineNote variant="info" data-slot="checkout-result">
          Checkout was cancelled. Nothing was charged.
        </InlineNote>
      )}
      {kept && (
        <InlineNote variant="success" role="status" data-slot="kept">
          Your subscription continues. Nothing changes until the next billing date.
        </InlineNote>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="billing-title" className="font-heading text-h2 leading-h2 font-semibold">
            {PLAN.name}
          </h2>
          <p className="text-number leading-number font-heading font-semibold" data-slot="price">
            {PLAN.price}
          </p>
          <p className="text-helper leading-helper font-semibold" data-slot="fill-price">
            plus {PLAN.fillPrice}
          </p>
        </div>
        {subscription && ending ? (
          <Badge variant="warning" size="lg" data-subscription={subscription.status} data-ending="true">
            <CalendarClock aria-hidden="true" />
            {SUBSCRIPTION_ENDING_LABEL}
          </Badge>
        ) : subscription ? (
          <Badge
            variant={subscribed ? "success" : "warning"}
            size="lg"
            data-subscription={subscription.status}
          >
            {subscribed ? <CircleCheck aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
            {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
          </Badge>
        ) : (
          <Badge variant="outline" size="lg" data-subscription="none">
            <CreditCard aria-hidden="true" />
            Not subscribed
          </Badge>
        )}
      </div>

      <ul className="flex flex-col gap-1 text-helper leading-helper text-muted-foreground">
        {PLAN.includes.map((line) => (
          <li key={line} className="flex gap-2">
            <CircleCheck aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {subscription && (
        <div className="flex flex-col gap-2 border-t border-border pt-4" data-slot="subscription">
          <p className="text-helper leading-helper text-muted-foreground">
            {ending
              ? "Your subscription is set to end. Driver search stays open until then; keep it to carry on without a break."
              : SUBSCRIPTION_STATUS_HELP[subscription.status]}
          </p>
          {subscribed && subscription.status === "trialing" && subscription.trialEnd && !ending ? (
            <p className="text-helper leading-helper" data-slot="trial-end">
              Your trial ends on <span className="font-semibold">{trialDateLabel(subscription.trialEnd)}</span>. Your
              card is charged $99 then, unless you cancel before.
            </p>
          ) : (
            periodEnd &&
            subscribed && (
              <p className="text-helper leading-helper">
                {ending ? "Access ends on" : "Next billing date:"}{" "}
                <span className="font-semibold" data-slot="period-end">
                  {periodEnd}
                </span>
                .
              </p>
            )
          )}
          {fills && (
            <p className="text-helper leading-helper" data-slot="fills">
              Completed fills since {longDate(fills.since)}:{" "}
              <span className="font-semibold">{fills.included + fills.billable + fills.waived}</span>
              {fills.included > 0 && <> ({fills.included} included in the trial)</>}
              {fills.billable > 0 && <>. To be billed: ${(fills.billableCents / 100).toFixed(2)}</>}
              {fills.waived > 0 && <>. Waived: {fills.waived}</>}.
            </p>
          )}
        </div>
      )}

      {!subscribed && (
        <div className="flex flex-col gap-3 border-t border-border pt-4" data-slot="disclosure">
          <h3 className="font-heading text-h3 leading-h3 font-semibold">
            {trial ? "How the trial and billing work" : "How billing works"}
          </h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-helper leading-helper">
            {priceDisclosure(trial).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <ConsentCard
            id="price-acknowledged"
            checked={acknowledged}
            onCheckedChange={(next) => {
              setAcknowledged(next);
              if (next) setAckError(undefined);
            }}
            text={priceAcknowledgment(trial)}
            error={ackError}
            disabled={pending !== undefined || confirming}
          />
        </div>
      )}

      {error && (
        <InlineNote variant="error" role="alert">
          {error}
        </InlineNote>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {ending && (
          <LoadingButton
            type="button"
            onClick={keep}
            loading={pending === "keep"}
            loadingText="Keeping..."
            disabled={pending !== undefined}
          >
            Keep my subscription
          </LoadingButton>
        )}
        {!subscribed && (
          <LoadingButton
            type="button"
            onClick={() => go("checkout")}
            loading={pending === "checkout"}
            loadingText="Opening checkout..."
            disabled={pending !== undefined || confirming}
          >
            {trial ? "Start 7-day trial" : subscription ? "Subscribe again" : "Subscribe"}
          </LoadingButton>
        )}
        {portalAvailable && (
          <LoadingButton
            type="button"
            variant="secondary"
            onClick={() => go("portal")}
            loading={pending === "portal"}
            loadingText="Opening billing..."
            disabled={pending !== undefined}
          >
            Manage billing
          </LoadingButton>
        )}
      </div>

      {testMode && (
        <p className="text-small leading-small text-muted-foreground" data-slot="test-mode">
          Test mode: payment goes through a page inside FleetGrid, not a real card.
        </p>
      )}
    </section>
  );
}
