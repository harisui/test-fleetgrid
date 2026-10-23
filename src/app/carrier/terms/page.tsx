import type { Metadata } from "next";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { TermsAcceptance } from "@/components/carrier/TermsAcceptance";
import { AppShell } from "@/components/layout/AppShell";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { requireCarrierStage } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Accept the Terms" };

const POINTS = [
  "Driver information is for filling your own shifts. It may not be copied, resold or shared.",
  "You verify every driver's CDL, medical card, TWIC, record and Clearinghouse status yourself. FleetGrid is a directory software platform, not an employer, staffing agency, or broker.",
  "The subscription is billed monthly and can be cancelled any time. Partial months are not refunded.",
] as const;

/** Step 2 of the carrier sign-up: the Terms of Service, accepted and logged. */
export default async function CarrierTermsPage() {
  await requireCarrierStage("terms");

  return (
    <AppShell width="narrow" headerActions={<LogoutButton />}>
      <div className="flex flex-col gap-6">
        <SignHeader eyebrow="Step 2 of 3" title="The Terms of Service" />
        <p className="text-helper leading-helper text-muted-foreground">
          The short version. The full text is linked below and in the footer of every page.
        </p>
        <ul className="flex flex-col gap-2 text-helper leading-helper" aria-label="Key terms">
          {POINTS.map((point) => (
            <li key={point} className="flex gap-3">
              <span aria-hidden="true" className="mt-2.5 size-2 shrink-0 rounded-badge bg-selection" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <TermsAcceptance />
      </div>
    </AppShell>
  );
}
