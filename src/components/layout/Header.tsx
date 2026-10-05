import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Logo } from "@/components/shared/Logo";
import type { NavItem } from "@/types/domain";

interface HeaderProps {
  /** Links shown inline on desktop. On mobile the same links live in MobileNav. */
  navItems?: NavItem[];
  /** Extra controls on the right, such as a logout button. */
  actions?: ReactNode;
}

export function Header({ navItems = [], actions }: HeaderProps) {
  return (
    <header className="bg-sign-panel text-sign-panel-foreground sticky top-0 z-40">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center rounded-badge">
          <Logo height={32} />
        </Link>

        {navItems.length > 0 && (
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:bg-sign-panel-foreground/10 rounded-md px-3 py-2 text-sm font-medium"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1">
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
