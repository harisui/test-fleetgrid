import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { getSupportContact } from "@/lib/support";
import { OtpForm } from "@/components/auth/OtpForm";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { readPendingPhone } from "@/lib/auth/pending-phone";
import { testLoginPrefill } from "@/lib/auth/prefill";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { SIGNUP_ROLES } from "@/types/domain";

export const metadata: Metadata = { title: "Enter your code" };

/**
 * The code screen. The number comes from the httpOnly cookie the login screen's action set,
 * never from the address, so no script on the page (the Ads tag included) can read it.
 */
export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const params = await searchParams;
  const phone = await readPendingPhone();
  if (!phone) redirect(LOGIN_PATH);
  const role = SIGNUP_ROLES.find((candidate) => candidate === params.role);

  return (
    <AuthShell support={getSupportContact()}>
      <SignHeader eyebrow="Check your texts" title="What is the code we sent you?" />
      <OtpForm phone={phone} role={role} defaultCode={testLoginPrefill().code} />
    </AuthShell>
  );
}
