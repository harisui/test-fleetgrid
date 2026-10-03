import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { PhoneForm } from "@/components/auth/PhoneForm";
import { AppShell } from "@/components/layout/AppShell";
import { InlineNote } from "@/components/shared/InlineNote";
import { SIGNUP_ROLES } from "@/types/domain";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const role = SIGNUP_ROLES.find((candidate) => candidate === params.role);
  const blocked = params.blocked === "1";

  return (
    <AppShell width="narrow">
      <AuthCard
        title="Log in or sign up"
        description="Enter your mobile number. No password needed."
      >
        {blocked && (
          <InlineNote variant="error" role="alert" className="mb-5">
            Your account has been blocked. Contact support for help.
          </InlineNote>
        )}
        <PhoneForm role={role} />
      </AuthCard>
    </AppShell>
  );
}
