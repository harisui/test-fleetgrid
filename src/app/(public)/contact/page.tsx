import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { ContactForm } from "@/components/marketing/ContactForm";
import { CONTACT, SMS_SENDER_NUMBER } from "@/content/marketing";
import { getSiteEnv } from "@/lib/env";
import { formatE164ForDisplay } from "@/lib/phone";
import { BUSINESS_NAME, getSupportContact } from "@/lib/support";
import { getContactService } from "@/server/contact";

export const metadata: Metadata = {
  title: "Contact FleetGrid",
  description:
    "Questions about FleetGrid in the Houston area? Send a message or email support@fleetgridus.com. FleetGrid LLC.",
  alternates: { canonical: "/contact" },
};

/** Rendered per request: the form's signed timestamp must be fresh, or the time trap means nothing. */
export const dynamic = "force-dynamic";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow uppercase text-sign-panel-muted">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function ContactPage() {
  const contact = getSupportContact();
  const site = getSiteEnv();
  const token = getContactService().issueToken();
  const linkClass = "underline underline-offset-4";

  return (
    <AppShell variant="marketing">
      <div className="flex flex-col gap-8 py-4 sm:py-8">
        <div className="flex max-w-reading flex-col gap-3">
          <h1 className="font-heading text-h1 leading-h1 font-bold sm:text-4xl sm:leading-tight">
            {CONTACT.title}
          </h1>
          <p className="text-body-lg leading-body-lg text-muted-foreground">{CONTACT.intro}</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-5 lg:gap-12">
          <div className="lg:col-span-3">
            <ContactForm token={token} supportEmail={contact.email} />
          </div>

          <aside
            aria-labelledby="contact-details"
            className="h-fit rounded-sign border-t-4 border-sign-panel-border bg-sign-panel p-6 text-sign-panel-foreground lg:col-span-2"
          >
            <h2 id="contact-details" className="font-heading text-h2 leading-h2 font-semibold">
              {CONTACT.details.heading}
            </h2>
            <dl className="mt-4 flex flex-col gap-4">
              <Detail label={CONTACT.details.email}>
                <a href={`mailto:${contact.email}`} className={linkClass}>
                  {contact.email}
                </a>
              </Detail>
              <Detail label={CONTACT.details.company}>{BUSINESS_NAME}</Detail>
              <Detail label={CONTACT.details.serviceArea}>{CONTACT.details.serviceAreaValue}</Detail>
              <Detail label={CONTACT.details.address}>
                <span data-slot="contact-address">
                  {contact.address.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </Detail>
              {site.NEXT_PUBLIC_SHOW_PHONE && (
                <Detail label={CONTACT.details.phone}>
                  <a href={`tel:${SMS_SENDER_NUMBER}`} className={linkClass} data-slot="contact-phone">
                    {formatE164ForDisplay(SMS_SENDER_NUMBER)}
                  </a>
                </Detail>
              )}
            </dl>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
