"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import { PLAN } from "@/lib/carrier/options";
import { completeTestCheckoutAction } from "@/server/actions/carrier.actions";

interface TestCheckoutProps {
  customerId: string;
}

/** Stands in for Stripe Checkout in test mode: one button that pays, one that goes back. */
export function TestCheckout({ customerId }: TestCheckoutProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function pay() {
    setPending(true);
    setError(undefined);
    const result = await completeTestCheckoutAction(customerId);
    if (!result.ok) {
      setPending(false);
      setError(result.error.message);
      return;
    }
    router.push("/carrier/billing?checkout=success");
    router.refresh();
  }

  return (
    <section
      aria-labelledby="test-checkout-title"
      className="flex flex-col gap-5 rounded-card border border-border bg-card p-5"
      data-slot="test-checkout"
    >
      <h1 id="test-checkout-title" className="font-heading text-h2 leading-h2 font-semibold">
        Test checkout
      </h1>
      <p className="text-helper leading-helper text-muted-foreground">
        This page stands in for Stripe while FleetGrid runs in test mode. No card is charged.
      </p>
      <dl className="flex flex-col gap-1 border-y border-border py-4 text-helper leading-helper">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-semibold">{PLAN.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Price</dt>
          <dd className="font-semibold">{PLAN.price}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Customer</dt>
          <dd className="font-mono text-code leading-code">{customerId}</dd>
        </div>
      </dl>
      {error && (
        <InlineNote variant="error" role="alert">
          {error}
        </InlineNote>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <LoadingButton type="button" onClick={pay} loading={pending} loadingText="Paying...">
          Pay {PLAN.price}
        </LoadingButton>
        <Button asChild variant="secondary">
          <Link href="/carrier/billing?checkout=cancelled">Cancel</Link>
        </Button>
      </div>
    </section>
  );
}
