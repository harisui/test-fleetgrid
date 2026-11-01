"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeAdminChild, ADMIN_NAV, isAdminNavActive } from "@/lib/admin/nav";
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
        const activeChild = item.children ? activeAdminChild(pathname, item) : null;
        // With sub-pages the item marks the section and the child marks the page.
        const current = active ? (item.children ? "true" : "page") : undefined;
        return (
          <div key={item.href} className="flex flex-col gap-1">
            <Link
              href={item.href}
              aria-current={current}
              data-active={active || undefined}
              onClick={onNavigate}
              className={cn(
                "flex h-target items-center gap-3 rounded-button border-l-3 px-3 text-label leading-label font-semibold outline-none transition-colors duration-(--dur-press) focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-sign-panel-border bg-sign-panel-foreground/10 text-sign-panel-foreground"
                  : "border-transparent text-sign-panel-muted hover:bg-sign-panel-foreground/10 hover:text-sign-panel-foreground",
              )}
            >
              <item.icon aria-hidden="true" className="size-5 shrink-0" />
              {item.label}
            </Link>
            {item.children && (
              <ul className="flex flex-col gap-1 pl-8" aria-label={item.label}>
                {item.children.map((child) => {
                  const childActive = child.href === activeChild;
                  return (
                    <li key={child.href}>
                      <Link
                        href={child.href}
                        aria-current={childActive ? "page" : undefined}
                        onClick={onNavigate}
                        className={cn(
                          "flex min-h-target items-center rounded-button border-l-3 px-3 text-label leading-label outline-none transition-colors duration-(--dur-press) focus-visible:ring-2 focus-visible:ring-ring",
                          childActive
                            ? "border-sign-panel-border bg-sign-panel-foreground/10 font-semibold text-sign-panel-foreground"
                            : "border-transparent text-sign-panel-muted hover:bg-sign-panel-foreground/10 hover:text-sign-panel-foreground",
                        )}
                      >
                        {child.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
