import type { Metadata } from "next";
import { DeleteAccountCard } from "@/components/account/DeleteAccountCard";
import { CarrierDetailsForm } from "@/components/carrier/CarrierDetailsForm";
import { CarrierStatusCard } from "@/components/carrier/CarrierStatusCard";
import { requireCarrierStage } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Account" };

/** The company details, the subscription at a glance, and account deletion. */
export default async function CarrierAccountPage() {
  const { user, access } = await requireCarrierStage("terms", "waitlist", "billing", "ready");
  const carrier = access.carrier!;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="font-heading text-h1 leading-h1 font-semibold">Account</h1>
      <CarrierStatusCard carrier={carrier} access={access} />
      <section aria-labelledby="details-title" className="flex flex-col gap-4">
        <h2 id="details-title" className="font-heading text-h2 leading-h2 font-semibold">
          Company details
        </h2>
        <CarrierDetailsForm carrier={carrier} />
      </section>
      <DeleteAccountCard phone={user.phone} />
    </div>
  );
}
