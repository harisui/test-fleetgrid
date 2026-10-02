import { FileText, User } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AppShell } from "@/components/layout/AppShell";
import { requireRole } from "@/lib/auth/guards";
import type { NavItem } from "@/types/domain";

const NAV_ITEMS: NavItem[] = [
  { href: "/driver/profile", label: "Profile", icon: <User /> },
  { href: "/driver/documents", label: "Documents", icon: <FileText /> },
];

export default async function DriverLayout({ children }: LayoutProps<"/driver">) {
  await requireRole("driver");

  return (
    <AppShell width="narrow" navItems={NAV_ITEMS} headerActions={<LogoutButton />}>
      {children}
    </AppShell>
  );
}
