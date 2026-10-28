"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV, isAdminNavActive } from "@/lib/admin/nav";
import { cn } from "@/lib/utils";

interface AdminNavProps {
  /** Called after a link is chosen, so a menu sheet can close. */
  onNavigate?: () => void;
}

/**
 * The admin's pages, one link each with its icon. The active one carries a 3px orange bar on
 * the left and a lighter fill; the rest take the fill on hover. Lives in the sidebar on a
 * desktop and in the menu sheet on a phone.
 */
export function AdminNav({ onNavigate }: AdminNavProps) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {ADMIN_NAV.map((item) => {
        const active = isAdminNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex h-target items-center gap-3 rounded-button border-l-[3px] px-3 text-label leading-label font-semibold outline-none transition-colors duration-(--dur-press) focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-sign-panel-foreground/10 text-sign-panel-foreground"
                : "border-transparent text-sign-panel-muted hover:bg-sign-panel-foreground/10 hover:text-sign-panel-foreground",
            )}
          >
            <item.icon aria-hidden="true" className="size-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
