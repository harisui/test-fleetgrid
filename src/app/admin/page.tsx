import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/shared/EmptyState";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Admin" };

/** Milestone 1 placeholder. The admin panel arrives in Milestone 3. */
export default async function AdminPage() {
  await requireRole("admin");

  return (
    <AppShell headerActions={<LogoutButton />}>
      <h1 className="sr-only">Admin</h1>
      <EmptyState
        icon={ShieldCheck}
        title="Admin panel coming soon"
        description="Driver, carrier and shift management arrive in a later milestone."
      />
    </AppShell>
  );
}
