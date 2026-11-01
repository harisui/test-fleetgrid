import { Building2, CalendarClock, ChartNoAxesColumn, CreditCard, MapPinned, Users, type LucideIcon } from "lucide-react";

/**
 * The admin sidebar, in order. The shell reads this list, so a new page is one line here.
 */
export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_HOME = "/admin/drivers";

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin/drivers", label: "Drivers", icon: Users },
  { href: "/admin/carriers", label: "Carriers", icon: Building2 },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/shifts", label: "Shifts", icon: CalendarClock },
  { href: "/admin/service-areas", label: "Service areas", icon: MapPinned },
  { href: "/admin/analytics", label: "Analytics", icon: ChartNoAxesColumn },
];

/** True when the current path is the item's page or below it. */
export function isAdminNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
