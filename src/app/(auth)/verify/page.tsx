import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { OtpForm } from "@/components/auth/OtpForm";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { normalizeUsPhone } from "@/lib/phone";
import { SIGNUP_ROLES } from "@/types/domain";

export const metadata: Metadata = { title: "Enter your code" };

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const params = await searchParams;
  const phone = typeof params.phone === "string" ? normalizeUsPhone(params.phone) : null;
  if (!phone) redirect(LOGIN_PATH);
  const role = SIGNUP_ROLES.find((candidate) => candidate === params.role);

  return (
    <AuthShell>
      <SignHeader eyebrow="Check your texts" title="What is the code we sent you?" />
      <OtpForm phone={phone} role={role} />
    </AuthShell>
  );
}
