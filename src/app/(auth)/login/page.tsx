import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { PhoneForm } from "@/components/auth/PhoneForm";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { InlineNote } from "@/components/shared/InlineNote";
import { testLoginPrefill } from "@/lib/auth/prefill";
import { SIGNUP_ROLES } from "@/types/domain";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const role = SIGNUP_ROLES.find((candidate) => candidate === params.role);
  const blocked = params.blocked === "1";

  return (
    <AuthShell>
      <SignHeader eyebrow="Log in or sign up" title="What is your mobile number?" />
      <p className="text-helper leading-helper text-muted-foreground">
        No password. We text you a code instead.
      </p>
      {blocked && (
        <InlineNote variant="error" role="alert">
          Your account has been blocked. Contact support for help.
        </InlineNote>
      )}
      <PhoneForm role={role} defaultPhone={testLoginPrefill().phone} />
    </AuthShell>
  );
}
