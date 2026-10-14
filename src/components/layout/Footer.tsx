import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { FOOTER, SMS_SENDER_NUMBER, type SiteLink } from "@/content/marketing";
import { getSiteEnv } from "@/lib/env";
import { formatE164ForDisplay } from "@/lib/phone";
import { BUSINESS_NAME, getSupportContact } from "@/lib/support";

const linkClass =
  "inline-flex min-h-target items-center text-sign-panel-muted underline-offset-4 hover:text-sign-panel-foreground hover:underline";

function FooterLinks({ links }: { links: readonly SiteLink[] }) {
  return (
    <ul className="flex flex-col">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className={linkClass}>
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ColumnTitle({ children }: { children: string }) {
  return (
    <h2 className="font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow uppercase">
      {children}
    </h2>
  );
}

/**
 * The graphite footer under every page, with the 4px orange stripe on top. The company
 * and how to reach it, the carrier, driver and company columns, then the legal line and
 * the texting line. The phone number for calls and the texting sender are shown only when
 * their switches are on. Reads the contact details on the server.
 */
export function Footer() {
  const contact = getSupportContact();
  const site = getSiteEnv();
  const smsNumber = formatE164ForDisplay(SMS_SENDER_NUMBER);

  return (
    <footer className="mt-auto border-t-4 border-sign-panel-border bg-sign-panel text-sign-panel-foreground text-helper leading-helper">
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3">
          <Logo height={28} />
          <p className="text-sign-panel-muted">{FOOTER.description}</p>
          <p className="font-semibold">{FOOTER.launchLine}</p>
          <address className="flex flex-col not-italic" data-slot="footer-contact">
            <a href={`mailto:${contact.email}`} className={linkClass}>
              {contact.email}
            </a>
            {site.NEXT_PUBLIC_SHOW_PHONE && (
              <a href={`tel:${SMS_SENDER_NUMBER}`} className={linkClass} data-slot="footer-phone">
                {smsNumber}
              </a>
            )}
            <span className="text-sign-panel-muted">{contact.address.join(", ")}</span>
          </address>
        </div>

        {FOOTER.columns.map((column) => (
          <nav key={column.title} aria-label={column.title} className="flex flex-col gap-2">
            <ColumnTitle>{column.title}</ColumnTitle>
            <FooterLinks links={column.links} />
          </nav>
        ))}

        <div className="flex flex-col gap-2">
          <ColumnTitle>{FOOTER.company.title}</ColumnTitle>
          <nav aria-label={FOOTER.company.title}>
            <FooterLinks links={FOOTER.company.links} />
          </nav>
          <nav aria-label="Legal">
            <FooterLinks links={FOOTER.legal} />
          </nav>
        </div>
      </div>

      <div className="border-t border-sign-panel-muted/30">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-small leading-small text-sign-panel-muted">
          <p data-slot="footer-legal-line">
            &copy; {new Date().getFullYear()} {BUSINESS_NAME}. {FOOTER.legalLine}
          </p>
          <p data-slot="footer-sms-line">
            {site.NEXT_PUBLIC_SHOW_SMS_NUMBER
              ? FOOTER.smsLine.withNumber(smsNumber)
              : FOOTER.smsLine.withoutNumber}
          </p>
        </div>
      </div>
    </footer>
  );
}
