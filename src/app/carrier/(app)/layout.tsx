import { Building2, CreditCard, Search } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AppShell } from "@/components/layout/AppShell";
import type { NavItem } from "@/types/domain";

const NAV_ITEMS: NavItem[] = [
  { href: "/carrier/search", label: "Search", icon: <Search /> },
  { href: "/carrier/billing", label: "Billing", icon: <CreditCard /> },
  { href: "/carrier/account", label: "Account", icon: <Building2 /> },
];

/** Search, billing, account and the waitlist, after the sign-up: header, navigation, log out and the bottom tab bar. */
export default function CarrierAppLayout({ children }: LayoutProps<"/carrier">) {
  return (
    <AppShell navItems={NAV_ITEMS} headerActions={<LogoutButton />}>
      {children}
    </AppShell>
  );
}
