import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminSignInForm } from "@/components/auth/AdminSignInForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { InlineNote } from "@/components/shared/InlineNote";
import { ADMIN_VERIFY_PATH, ROLE_HOME } from "@/lib/auth/routes";
import { getSupportContact } from "@/lib/support";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Admin sign-in", robots: { index: false, follow: false } };

/** Admin sign-in, step 1 of 2 (0039). A password session already open goes to the next step. */
export default async function AdminSignInPage({ searchParams }: PageProps<"/admin-sign-in">) {
  const { authService, adminAuthService } = await getContainer();
  const session = await authService.getSession();
  if (session?.profile?.role === "admin") {
    const level = await adminAuthService.sessionLevel();
    if (level === "strong") redirect(ROLE_HOME.admin);
    if (level === "needs-code") redirect(ADMIN_VERIFY_PATH);
  }
  const params = await searchParams;

  return (
    <AuthShell support={getSupportContact()}>
      <SignHeader eyebrow="FleetGrid admin" title="Sign in" />
      {params.reason === "password" && (
        <InlineNote variant="info" role="status">
          Admins sign in with email and password, then a code from an authenticator app.
        </InlineNote>
      )}
      <AdminSignInForm />
    </AuthShell>
  );
}
