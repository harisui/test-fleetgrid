import type { ReactNode } from "react";
import { AdminMobileBar } from "@/components/admin/AdminMobileBar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

interface AdminFrameProps {
  adminLabel: string;
  children: ReactNode;
}

/**
 * The admin's app frame: the fixed sidebar from the lg breakpoint, the mobile bar below it,
 * and the content column beside the sidebar. Pages put their own top bar and content inside
 * with AdminPage.
 */
export function AdminFrame({ adminLabel, children }: AdminFrameProps) {
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-background px-4 py-2 text-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <AdminSidebar adminLabel={adminLabel} className="hidden lg:flex" />
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <AdminMobileBar adminLabel={adminLabel} />
        {children}
      </div>
    </div>
  );
}
