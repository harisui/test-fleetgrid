"use client";

import { format } from "date-fns";
import { CircleCheck, CreditCard, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PLAN, SUBSCRIPTION_STATUS_HELP, SUBSCRIPTION_STATUS_LABELS } from "@/lib/carrier/options";
import {
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
}

/** The plan, the state of the subscription, and the buttons that start or manage it. */
export function BillingCard({
  subscription,
  subscribed,
  portalAvailable,
  testMode,
  checkoutResult,
}: BillingCardProps) {
  const router = useRouter();
  const [pending, setPending] = useState<"checkout" | "portal">();
  const [error, setError] = useState<string>();
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
    setPending(kind);
    setError(undefined);
    const result = kind === "checkout" ? await startCheckoutAction() : await openBillingPortalAction();
    if (!result.ok) {
      setPending(undefined);
      setError(result.error.message);
      return;
    }
    window.location.assign(result.data.url);
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
      {checkoutResult === "success" && subscribed && (
        <InlineNote variant="success" data-slot="checkout-result">
          Payment received. Thank you. Your subscription is active.
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="billing-title" className="font-heading text-h2 leading-h2 font-semibold">
            {PLAN.name}
          </h2>
          <p className="text-number leading-number font-heading font-semibold" data-slot="price">
            {PLAN.price}
          </p>
        </div>
        {subscription ? (
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
            {SUBSCRIPTION_STATUS_HELP[subscription.status]}
          </p>
          {periodEnd && subscribed && (
            <p className="text-helper leading-helper">
              {subscription.cancelAtPeriodEnd ? "Access ends on" : "Next billing date:"}{" "}
              <span className="font-semibold" data-slot="period-end">
                {periodEnd}
              </span>
              .
            </p>
          )}
        </div>
      )}

      {!subscribed && (
        <p className="text-helper leading-helper text-muted-foreground">
          Billed monthly. Cancel any time from the billing page; access runs to the end of the
          paid month.
        </p>
      )}

      {error && (
        <InlineNote variant="error" role="alert">
          {error}
        </InlineNote>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {!subscribed && (
          <LoadingButton
            type="button"
            onClick={() => go("checkout")}
            loading={pending === "checkout"}
            loadingText="Opening checkout..."
            disabled={pending !== undefined || confirming}
          >
            {subscription ? "Subscribe again" : "Subscribe"}
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
