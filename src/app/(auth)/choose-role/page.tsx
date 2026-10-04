import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { getSupportContact } from "@/lib/support";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { RoleChooser } from "@/components/auth/RoleChooser";
import { SignHeader } from "@/components/onboarding/SignHeader";
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
    <AuthShell support={getSupportContact()}>
      <SignHeader eyebrow="One more thing" title="How will you use FleetGrid?" />
      <p className="text-helper leading-helper text-muted-foreground">
        Pick the one that fits. This cannot be changed later without our help.
      </p>
      <RoleChooser defaultRole={defaultRole} />
      <div className="flex items-center justify-center gap-2 text-helper leading-helper text-muted-foreground">
        <span>Wrong number?</span>
        <LogoutButton />
      </div>
    </AuthShell>
  );
}
