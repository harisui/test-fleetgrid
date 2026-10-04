import Link from "next/link";
import type { ReactNode } from "react";
import { HelpSheet } from "@/components/onboarding/HelpSheet";
import type { SupportContact } from "@/lib/support";

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/sms-terms", label: "SMS Terms" },
] as const;

/**
 * The frame around the login, code and role screens: the same graphite header as onboarding
 * (wordmark and Help only), a 560px column, and the legal links. No app navigation.
 */
export function AuthShell({
  children,
  support,
}: {
  children: ReactNode;
  /** Shown in the Help sheet. */
  support?: SupportContact;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background" data-slot="auth-shell">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-badge bg-card px-4 py-2 text-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="bg-sign-panel text-sign-panel-foreground">
        <div className="mx-auto flex h-14 w-full max-w-content items-center justify-between px-4">
          <Link href="/" className="font-heading text-h2 leading-h2 font-bold tracking-wide">
            FLEETGRID
          </Link>
          <HelpSheet support={support} />
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-content flex-1 flex-col gap-4 px-4 py-4 pb-8"
      >
        {children}
      </main>
      <footer className="border-t border-border">
        <nav aria-label="Legal" className="mx-auto w-full max-w-content px-4">
          <ul className="flex items-center gap-1 py-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-target items-center rounded-badge px-3 text-small leading-small text-muted-foreground underline-offset-4 hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </footer>
    </div>
  );
}
