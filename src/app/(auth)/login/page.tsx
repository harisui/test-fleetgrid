import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/AuthCard";
import { PhoneForm } from "@/components/auth/PhoneForm";
import { AppShell } from "@/components/layout/AppShell";
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
          <p
            role="alert"
            className="border-destructive/60 bg-destructive/15 mb-5 rounded-md border p-3 text-sm"
          >
            Your account has been blocked. Contact support for help.
          </p>
        )}
        <PhoneForm role={role} />
      </AuthCard>
    </AppShell>
  );
}
