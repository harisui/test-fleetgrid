import type { Metadata } from "next";
import { BillingCard } from "@/components/carrier/BillingCard";
import { requireCarrierStage } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Billing" };

/** The plan, the subscription and the buttons that start or manage it. */
export default async function CarrierBillingPage({ searchParams }: PageProps<"/carrier/billing">) {
  const { user, access } = await requireCarrierStage("billing", "ready");
  const { subscriptionService } = await getContainer();
  const billing = await subscriptionService.getBilling(user.id);
  const params = await searchParams;
  const checkoutResult = typeof params.checkout === "string" ? params.checkout : undefined;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 leading-h1 font-semibold">Billing</h1>
        <p className="text-helper leading-helper text-muted-foreground">
          {access.subscribed
            ? "Your card and plan are managed on the billing page, run by Stripe."
            : "Subscribe to open driver search. Payment is handled by Stripe."}
        </p>
      </div>
      <BillingCard
        subscription={billing.subscription}
        subscribed={billing.subscribed}
        portalAvailable={billing.portalAvailable}
        testMode={billing.testMode}
        checkoutResult={checkoutResult}
      />
    </div>
  );
}
