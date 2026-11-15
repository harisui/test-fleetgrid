import type { Metadata } from "next";
import { AdminAccountForms } from "@/components/admin/AdminAccountPage";
import { AdminPage } from "@/components/admin/AdminPage";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Account settings" };

/** The signed-in admin's own account (0039): name, email, password and authenticator app. */
export default async function AdminAccountPage() {
  const { user, profile } = await requireAdmin();
  const { adminAuthService } = await getContainer();
  const authenticators = await adminAuthService.authenticatorCount();

  return (
    <AdminPage title="Account settings" subtitle="Your own admin account: how you sign in.">
      <AdminAccountForms name={user.name ?? null} email={profile.email} authenticators={authenticators} />
    </AdminPage>
  );
}
