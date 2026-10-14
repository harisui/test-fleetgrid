import type { Metadata } from "next";
import { DeleteAccountCard } from "@/components/account/DeleteAccountCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { CarrierDetailsForm } from "@/components/carrier/CarrierDetailsForm";
import { AppShell } from "@/components/layout/AppShell";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { requireCarrierStage } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Set up your company" };

/** The carrier's one-page sign-up. Next come the Terms, then billing. */
export default async function CarrierOnboardingPage() {
  const { user } = await requireCarrierStage("onboarding");

  return (
    <AppShell width="narrow" headerActions={<LogoutButton />}>
      <div className="flex flex-col gap-6">
        <SignHeader eyebrow="Step 1 of 3" title="Set up your company" />
        <p className="text-helper leading-helper text-muted-foreground">
          Tell us who you are and where your yard is. Drivers are searched by distance from it.
        </p>
        <CarrierDetailsForm />
        {/* Picked the wrong role? Deleting the account frees the number for a fresh sign-up. */}
        <DeleteAccountCard phone={user.phone} />
      </div>
    </AppShell>
  );
}
