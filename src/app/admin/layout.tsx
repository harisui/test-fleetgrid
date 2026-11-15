import { AdminFrame } from "@/components/admin/AdminFrame";
import { ToastHost } from "@/components/layout/ToastHost";
import { requireAdmin } from "@/lib/auth/guards";
import { formatE164ForDisplay } from "@/lib/phone";

/**
 * Every admin page sits in the admin frame, behind the admin guard: a non-admin gets the 403
 * page (src/app/forbidden.tsx). Toasts sit bottom right, out of the table's way.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user, profile } = await requireAdmin();
  const admin = { name: user.name ?? null, contact: profile.email ?? formatE164ForDisplay(profile.phone) };
  return (
    <ToastHost position="bottom-right">
      <AdminFrame admin={admin}>{children}</AdminFrame>
    </ToastHost>
  );
}
