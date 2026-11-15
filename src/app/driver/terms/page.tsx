import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { DriverTermsForm } from "@/components/driver/DriverTermsForm";
import { TermsReview } from "@/components/driver/TermsReview";
import { AppShell } from "@/components/layout/AppShell";
import { CURRENT_TERMS } from "@/content/legal/terms";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Terms of Service" };

/**
 * The Terms a signed-in driver must accept before any other driver page, when a version needs
 * everyone again (Milestone 6). No navigation and no skip. Profile, documents and status stay
 * as they are; shift offers resume once accepted.
 */
export default async function DriverTermsPage() {
  await requireRole("driver");
  const { termsService } = await getContainer();
  if (!(await termsService.needsAcceptance())) redirect("/driver");

  return (
    <AppShell width="narrow" headerActions={<LogoutButton />}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Our Terms of Service changed</h1>
          <p className="text-helper leading-helper text-muted-foreground">
            Please read and accept them to keep getting shift offers. Your profile and documents stay as they are.
          </p>
        </div>
        <TermsReview terms={CURRENT_TERMS} />
        <DriverTermsForm mode={{ kind: "gate" }} />
      </div>
    </AppShell>
  );
}
