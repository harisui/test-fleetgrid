import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { OtpForm } from "@/components/auth/OtpForm";
import { AppShell } from "@/components/layout/AppShell";
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
    <AppShell width="narrow">
      <AuthCard title="Enter your code">
        <OtpForm phone={phone} role={role} />
      </AuthCard>
    </AppShell>
  );
}
