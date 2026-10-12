import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TestCheckout } from "@/components/carrier/TestCheckout";
import { requireCarrierStage } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Test checkout" };

/**
 * Stands in for Stripe Checkout when FleetGrid runs in test mode. Only the carrier whose
 * customer id is in the URL can see it; everyone else goes back to billing.
 */
export default async function TestCheckoutPage({
  searchParams,
}: PageProps<"/carrier/billing/test-checkout">) {
  const { user, access } = await requireCarrierStage("billing");
  const { subscriptionService } = await getContainer();
  const billing = await subscriptionService.getBilling(user.id);
  const params = await searchParams;
  const customerId = typeof params.customer === "string" ? params.customer : null;
  if (!billing.testMode || !customerId || access.carrier?.stripeCustomerId !== customerId) {
    redirect("/carrier/billing");
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <TestCheckout customerId={customerId} />
    </div>
  );
}
