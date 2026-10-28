import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Logo } from "@/components/shared/Logo";
import { ADMIN_HOME } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
  /** Who is signed in, shown at the bottom: the admin's number. */
  adminLabel: string;
  className?: string;
  onNavigate?: () => void;
}

/** The admin's name, the theme toggle and Log out, pinned to the bottom of the sidebar and the menu sheet. */
export function AdminSidebarFooter({ adminLabel }: { adminLabel: string }) {
  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-sign-panel-foreground/15 pt-4">
      <p className="px-3 text-small leading-small text-sign-panel-muted" data-slot="admin-label">
        <span className="block text-eyebrow leading-eyebrow font-semibold text-sign-panel-foreground">
          Admin
        </span>
        <span className="font-mono">{adminLabel}</span>
      </p>
      <div className="flex items-center justify-between gap-2 px-1">
        <LogoutButton />
        <ThemeToggle />
      </div>
    </div>
  );
}

/**
 * The fixed left column of the admin on a desktop (from the lg breakpoint): 240px wide on
 * the graphite sign panel with the 4px orange stripe on top, the wordmark, the pages, and
 * the admin's controls at the bottom.
 */
export function AdminSidebar({ adminLabel, className, onNavigate }: AdminSidebarProps) {
  return (
    <aside
      data-slot="admin-sidebar"
      className={cn(
        "fixed inset-y-0 left-0 z-40 w-60 flex-col gap-6 border-t-4 border-sign-panel-border bg-sign-panel p-4 text-sign-panel-foreground",
        className,
      )}
    >
      <Link href={ADMIN_HOME} className="flex items-center rounded-badge px-1">
        <Logo height={28} />
        <span className="sr-only">FleetGrid admin</span>
      </Link>
      <AdminNav onNavigate={onNavigate} />
      <AdminSidebarFooter adminLabel={adminLabel} />
    </aside>
  );
}
