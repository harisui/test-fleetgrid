import Link from "next/link";
import { BUSINESS_NAME, getSupportContact } from "@/lib/support";

const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/sms-terms", label: "SMS Terms" },
] as const;

/** The company, how to reach it, and the legal links. Reads the contact details on the server. */
export function Footer() {
  const contact = getSupportContact();
  return (
    <footer className="border-border text-muted-foreground border-t text-sm">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1 text-center sm:text-left">
          <p>
            &copy; {new Date().getFullYear()} {BUSINESS_NAME}
          </p>
          <address className="flex flex-col gap-1 not-italic" data-slot="footer-contact">
            <a
              href={`mailto:${contact.email}`}
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              {contact.email}
            </a>
            <span>{contact.address.join(", ")}</span>
          </address>
        </div>
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
