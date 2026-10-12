import type { Metadata } from "next";
import { WaitlistCard } from "@/components/carrier/WaitlistCard";
import { requireCarrierStage } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Not in your area yet" };

/** A carrier whose yard is outside every launch area cannot subscribe yet. */
export default async function CarrierWaitlistPage() {
  const { access } = await requireCarrierStage("waitlist");
  const carrier = access.carrier!;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <WaitlistCard
        yard={`${carrier.city}, ${carrier.state} ${carrier.zip}`}
        joined={access.waitlisted}
      />
    </div>
  );
}
