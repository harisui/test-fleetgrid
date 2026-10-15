import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/layout/Container";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { MobileMenu } from "@/components/marketing/MobileMenu";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/Logo";
import { HEADER_CTA, LOGIN_LINK, NAV_LINKS } from "@/content/marketing";
import type { NavItem } from "@/types/domain";

export type HeaderVariant = "app" | "marketing";

interface HeaderProps {
  /** app: the graphite bar of the signed-in pages. marketing: the public site's header. */
  variant?: HeaderVariant;
  /** Links shown inline on desktop. On mobile the same links live in MobileNav. */
  navItems?: NavItem[];
  /** Extra controls on the right, such as a logout button. */
  actions?: ReactNode;
}

export function Header({ variant = "app", navItems = [], actions }: HeaderProps) {
  if (variant === "marketing") return <MarketingHeader />;

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

/**
 * The public site's header: wordmark, the four section links, "Log in" and the "Find
 * drivers" button on desktop; wordmark, "Log in" and the menu button on phones. Sticky on
 * the background token with a 1px border; the shadow appears only once the page has
 * scrolled 8px (HeaderShadow sets data-scrolled).
 */
function MarketingHeader() {
  return (
    <header
      data-slot="site-header"
      className="sticky top-0 z-40 border-b border-border bg-background text-foreground shadow-0 transition-shadow duration-(--motion-base) ease-motion data-scrolled:shadow-1"
    >
      <Container className="flex h-16 items-center gap-4">
        <Link href="/" className="flex items-center rounded-badge">
          <Logo height={32} surface="page" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex h-target items-center rounded-button px-3 text-label leading-label font-semibold underline-offset-4 hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle className="hover:bg-muted" />
          <Link
            href={LOGIN_LINK.href}
            className="flex h-target items-center rounded-button px-3 text-label leading-label font-semibold underline-offset-4 hover:underline"
          >
            {LOGIN_LINK.label}
          </Link>
          <Button asChild size="md" className="hidden md:inline-flex">
            <Link href={HEADER_CTA.href}>{HEADER_CTA.label}</Link>
          </Button>
          <MobileMenu />
        </div>
      </Container>
    </header>
  );
}
