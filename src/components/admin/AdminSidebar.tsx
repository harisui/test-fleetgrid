import { UserCog } from "lucide-react";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Logo } from "@/components/shared/Logo";
import { ADMIN_HOME } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

/** Who is signed in: the name they set, and the email (or phone) they sign in with. */
export interface AdminIdentity {
  name: string | null;
  contact: string;
}

interface AdminSidebarProps {
  admin: AdminIdentity;
  className?: string;
  onNavigate?: () => void;
}

/**
 * Who is signed in, the account settings, the theme toggle and Log out, pinned to the bottom of
 * the sidebar and the menu sheet. A long email is cut with an ellipsis; the full one shows on
 * hover and in the account settings.
 */
export function AdminSidebarFooter({ admin, onNavigate }: { admin: AdminIdentity; onNavigate?: () => void }) {
  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-sign-panel-foreground/15 pt-4">
      <p className="flex min-w-0 flex-col px-3 text-small leading-small text-sign-panel-muted" data-slot="admin-label">
        <span className="truncate text-label leading-label font-semibold text-sign-panel-foreground">
          {admin.name ?? "Admin"}
        </span>
        <span className="truncate" title={admin.contact}>
          {admin.contact}
        </span>
      </p>
      <Link
        href="/admin/account"
        onClick={onNavigate}
        className="flex min-h-target items-center gap-3 rounded-button px-3 text-label leading-label text-sign-panel-muted outline-none hover:bg-sign-panel-foreground/10 hover:text-sign-panel-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <UserCog aria-hidden="true" className="size-4 shrink-0" />
        Account settings
      </Link>
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
export function AdminSidebar({ admin, className, onNavigate }: AdminSidebarProps) {
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
      <AdminSidebarFooter admin={admin} onNavigate={onNavigate} />
    </aside>
  );
}
