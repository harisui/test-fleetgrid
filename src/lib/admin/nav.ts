import {
  Building2,
  CalendarClock,
  ChartNoAxesColumn,
  CreditCard,
  MapPinned,
  MessageSquare,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The admin sidebar, in order. The shell reads this list, so a new page is one line here.
 */
export interface AdminNavChild {
  href: string;
  label: string;
}

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Sub-pages, listed under the item; the item is active on any of them. */
  children?: readonly AdminNavChild[];
}

export const ADMIN_HOME = "/admin/drivers";

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin/drivers", label: "Drivers", icon: Users },
  { href: "/admin/carriers", label: "Carriers", icon: Building2 },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/shifts", label: "Shifts", icon: CalendarClock },
  { href: "/admin/service-areas", label: "Service areas", icon: MapPinned },
  {
    href: "/admin/messaging",
    label: "Messaging",
    icon: MessageSquare,
    children: [
      { href: "/admin/messaging", label: "Activity" },
      { href: "/admin/messaging/send", label: "Send notice" },
    ],
  },
  { href: "/admin/analytics", label: "Analytics", icon: ChartNoAxesColumn },
];

/** True when the current path is the item's page or below it. */
export function isAdminNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The child page that is open: the longest child path that matches (Activity is the parent's own path). */
export function activeAdminChild(pathname: string, item: AdminNavItem): string | null {
  const matches = (item.children ?? [])
    .map((child) => child.href)
    .filter((href) => isAdminNavActive(pathname, href))
    .sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
}
