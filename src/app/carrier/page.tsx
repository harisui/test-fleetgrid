import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/shared/EmptyState";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Carrier" };

/** Milestone 1 placeholder. Carrier onboarding, billing and search arrive in Milestone 2. */
export default async function CarrierPage() {
  await requireRole("carrier");

  return (
    <AppShell width="narrow" headerActions={<LogoutButton />}>
      <h1 className="sr-only">Carrier</h1>
      <EmptyState
        icon={Building2}
        title="Carrier setup coming soon"
        description="Your account is created. We will text you when carrier onboarding opens."
      />
    </AppShell>
  );
}
