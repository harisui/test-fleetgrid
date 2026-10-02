"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types/domain";

interface MobileNavProps {
  navItems: NavItem[];
}

/** Bottom tab bar for phones. Hidden from the md breakpoint up, where Header shows the links. */
export function MobileNav({ navItems }: MobileNavProps) {
  const pathname = usePathname();
  if (navItems.length === 0) return null;

  return (
    <nav
      aria-label="Main mobile"
      className="bg-card border-border fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
    >
      <ul className="mx-auto flex max-w-5xl">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {item.icon && (
                  <span aria-hidden="true" className="[&_svg]:size-5">
                    {item.icon}
                  </span>
                )}
                <span className={cn(active && "underline underline-offset-4")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
