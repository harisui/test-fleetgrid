import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminTotpForm } from "@/components/auth/AdminTotpForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { ADMIN_SIGN_IN_PATH, ROLE_HOME } from "@/lib/auth/routes";
import { getSupportContact } from "@/lib/support";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Admin sign-in", robots: { index: false, follow: false } };

/** Admin sign-in, step 2 of 2 (0039): set up the authenticator once, then a code each time. */
export default async function AdminVerifyPage() {
  const { authService, adminAuthService } = await getContainer();
  const session = await authService.getSession();
  if (!session?.profile || session.profile.role !== "admin" || session.profile.status === "blocked") redirect(ADMIN_SIGN_IN_PATH);

  const level = await adminAuthService.sessionLevel();
  if (level === "strong") redirect(ROLE_HOME.admin);
  if (level === "needs-password") {
    await authService.signOut().catch(() => undefined);
    redirect(`${ADMIN_SIGN_IN_PATH}?reason=password`);
  }
  const state = await adminAuthService.verifyState();

  return (
    <AuthShell support={getSupportContact()}>
      <SignHeader
        eyebrow="FleetGrid admin"
        title={state.mode === "enroll" ? "Set up your authenticator app" : "Enter your code"}
      />
      <p className="text-helper leading-helper text-muted-foreground">
        {state.mode === "enroll"
          ? "Admin accounts need a code from an authenticator app at each sign-in. This takes a minute, once."
          : "Open your authenticator app and type the 6-digit code for FleetGrid."}
      </p>
      <AdminTotpForm mode={state.mode} factorId={state.mode === "verify" ? state.factorId : undefined} />
    </AuthShell>
  );
}
