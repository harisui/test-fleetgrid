import { ChartNoAxesColumn, Users, type LucideIcon } from "lucide-react";

/**
 * The admin sidebar, in order. Milestone 3 adds Carriers, Subscriptions, Shifts and Service
 * areas here; the shell reads this list, so nothing else changes.
 */
export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_HOME = "/admin/drivers";

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin/drivers", label: "Drivers", icon: Users },
  { href: "/admin/analytics", label: "Analytics", icon: ChartNoAxesColumn },
];

/** True when the current path is the item's page or below it. */
export function isAdminNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
