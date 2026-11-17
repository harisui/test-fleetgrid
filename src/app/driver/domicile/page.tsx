import type { Metadata } from "next";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { DomicileQuestions } from "@/components/driver/DomicileQuestions";
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Your state of domicile" };

/**
 * The attorney's domicile questions (Milestone 6, 0044). Every driver answers them once before
 * the other driver pages, and can change them later from the profile. A valid CDL from any
 * state is accepted.
 */
export default async function DomicilePage() {
  const { user } = await requireRole("driver");
  const { driverService } = await getContainer();
  const driver = await driverService.getCard(user.id);
  if (!driver) redirect("/driver/onboarding");

  return (
    <AppShell width="narrow" headerActions={<LogoutButton />}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Where you live</h1>
          <p className="text-helper leading-helper text-muted-foreground">
            A few questions about your state of domicile. A valid CDL from any state is accepted.
          </p>
        </div>
        <DomicileQuestions driver={driver} />
      </div>
    </AppShell>
  );
}
