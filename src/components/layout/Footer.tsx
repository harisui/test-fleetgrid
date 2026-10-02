import Link from "next/link";

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/sms-terms", label: "SMS Terms" },
] as const;

export function Footer() {
  return (
    <footer className="border-border text-muted-foreground border-t text-sm">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 px-4 py-6 sm:flex-row sm:justify-between">
        <p>&copy; {new Date().getFullYear()} FleetGrid</p>
        <nav aria-label="Legal">
          <ul className="flex items-center gap-1">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center rounded-md px-3 underline-offset-4 outline-none hover:underline focus-visible:ring-2"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
