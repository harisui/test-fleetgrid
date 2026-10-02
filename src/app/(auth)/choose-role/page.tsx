import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { RoleChooser } from "@/components/auth/RoleChooser";
import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/guards";
import { homePathFor } from "@/lib/auth/routes";
import { SIGNUP_ROLES } from "@/types/domain";

export const metadata: Metadata = { title: "Choose your account type" };

export default async function ChooseRolePage({ searchParams }: PageProps<"/choose-role">) {
  const { profile } = await requireSession();
  if (profile) redirect(homePathFor(profile));

  const params = await searchParams;
  const defaultRole = SIGNUP_ROLES.find((candidate) => candidate === params.role);

  return (
    <AppShell width="narrow" headerActions={<LogoutButton />}>
      <AuthCard
        title="How will you use FleetGrid?"
        description="This cannot be changed later, so pick the one that fits."
      >
        <RoleChooser defaultRole={defaultRole} />
      </AuthCard>
    </AppShell>
  );
}
