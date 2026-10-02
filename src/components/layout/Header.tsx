import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { NavItem } from "@/types/domain";

interface HeaderProps {
  /** Links shown inline on desktop. On mobile the same links live in MobileNav. */
  navItems?: NavItem[];
  /** Extra controls on the right, such as a logout button. */
  actions?: ReactNode;
}

export function Header({ navItems = [], actions }: HeaderProps) {
  return (
    <header className="bg-sidebar text-sidebar-foreground sticky top-0 z-40">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
        <Link
          href="/"
          className="focus-visible:ring-ring rounded-md text-lg font-semibold tracking-tight outline-none focus-visible:ring-2"
        >
          Fleet<span className="text-accent">Grid</span>
        </Link>

        {navItems.length > 0 && (
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:bg-sidebar-foreground/10 focus-visible:ring-ring rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2"
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
