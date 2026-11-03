import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { CdlStateQuestion } from "@/components/driver/CdlStateQuestion";
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Your CDL state" };

/**
 * The one question a card saved before CR-5 must answer before any other driver page. There
 * is no navigation and no skip: every driver page sends here until it is answered.
 */
export default async function CdlStatePage() {
  const { user } = await requireRole("driver");
  const { driverService } = await getContainer();
  if (!(await driverService.needsCdlState(user.id))) redirect("/driver");

  return (
    <AppShell width="narrow" headerActions={<LogoutButton />}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Which state issued your CDL?</h1>
          <p className="text-helper leading-helper text-muted-foreground">
            One quick question before you go on. FleetGrid starts with Texas CDL holders, so we need the state on your card.
          </p>
        </div>
        <CdlStateQuestion />
      </div>
    </AppShell>
  );
}
