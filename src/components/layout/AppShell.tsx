import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { Header, type HeaderVariant } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { HeaderShadow } from "@/components/marketing/HeaderShadow";
import { LaunchStrip } from "@/components/marketing/LaunchStrip";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/types/domain";

interface AppShellProps {
  children: ReactNode;
  /** app (default): the signed-in pages. marketing: the public site with its strip, header and footer. */
  variant?: HeaderVariant;
  navItems?: NavItem[];
  headerActions?: ReactNode;
  /** Narrow column for forms and driver screens, wide for tables and dashboards. */
  width?: "narrow" | "wide";
  showFooter?: boolean;
}

export function AppShell({
  children,
  variant = "app",
  navItems = [],
  headerActions,
  width = "wide",
  showFooter = true,
}: AppShellProps) {
  const hasMobileNav = navItems.length > 0;
  const marketing = variant === "marketing";

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col">
      <a
        href="#main-content"
        className="bg-background text-foreground focus:ring-ring sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      {marketing && <HeaderShadow />}
      {marketing && <LaunchStrip />}
      <Header variant={variant} navItems={navItems} actions={headerActions} />
      <main
        id="main-content"
        className={cn(
          "mx-auto w-full flex-1 px-4 py-6",
          width === "narrow" ? "max-w-xl" : "max-w-5xl",
          hasMobileNav && "pb-24 md:pb-6",
        )}
      >
        {children}
      </main>
      {showFooter && (
        <div className={cn("flex flex-col", hasMobileNav && "hidden md:flex")}>
          <Footer />
        </div>
      )}
      <MobileNav navItems={navItems} />
    </div>
  );
}
