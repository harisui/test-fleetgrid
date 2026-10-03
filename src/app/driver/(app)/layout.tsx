import { FileText, User } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AppShell } from "@/components/layout/AppShell";
import type { NavItem } from "@/types/domain";

const NAV_ITEMS: NavItem[] = [
  { href: "/driver/profile", label: "Profile", icon: <User /> },
  { href: "/driver/documents", label: "Documents", icon: <FileText /> },
];

/** Profile and Documents, after onboarding: header, navigation, log out and the bottom tab bar. */
export default function DriverAppLayout({ children }: LayoutProps<"/driver">) {
  return (
    <AppShell width="narrow" navItems={NAV_ITEMS} headerActions={<LogoutButton />}>
      {children}
    </AppShell>
  );
}
