import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeading, LegalPage } from "@/components/layout/LegalPage";
import { SMS_CONSENT_TEXT, SMS_PROGRAM_NAME } from "@/lib/constants";
import { formatE164ForDisplay } from "@/lib/phone";
import { BUSINESS_NAME, getSupportContact } from "@/lib/support";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/sms-terms");

const linkClass = "text-foreground underline underline-offset-4";

/** The section headings, in order, for the table of contents. Each one is a LegalHeading below. */
export const SMS_TERMS_SECTIONS = [
  "Program name",
  "What messages we send",
  "How you opt in",
  "Message frequency",
  "Cost",
  "How to opt out",
  "Help",
  "Carriers",
  "Privacy",
] as const;

/** SMS program disclosure for carrier registration (toll-free verification and A2P 10DLC). */
export default function SmsTermsPage() {
  const support = getSupportContact();
  return (
    <LegalPage path="/sms-terms" title="SMS Terms" sections={SMS_TERMS_SECTIONS}>
      <LegalHeading>Program name</LegalHeading>
      <p>
        {SMS_PROGRAM_NAME}, sent by {BUSINESS_NAME}.
      </p>

      <LegalHeading>What messages we send</LegalHeading>
      <p>
        FleetGrid texts drivers who have opted in about available work shifts that match their
        qualification card, and sends follow-up messages about those shifts, such as a confirmation
        when you claim one or a notice that a shift has been filled. We also text one-time login
        codes when you sign in. We do not send marketing messages.
      </p>

      <LegalHeading>How you opt in</LegalHeading>
      <p>Drivers opt in during sign-up by checking an unchecked box next to this statement:</p>
      <blockquote className="border-border text-muted-foreground border-l-4 pl-4">
        {SMS_CONSENT_TEXT}
      </blockquote>
      <p>Consent to receive text messages is not a condition of any purchase.</p>

      <LegalHeading>Message frequency</LegalHeading>
      <p>
        Message frequency varies. It depends on how many matching shifts are posted in your area.
      </p>

      <LegalHeading>Cost</LegalHeading>
      <p>Msg &amp; data rates may apply. FleetGrid does not charge drivers for messages.</p>

      <LegalHeading>How to opt out</LegalHeading>
      <p>
        Reply <strong>STOP</strong> to any FleetGrid message to stop receiving shift offers. You
        will get one message confirming that you are unsubscribed. To start again, reply{" "}
        <strong>START</strong>.
      </p>

      <LegalHeading>Help</LegalHeading>
      <p>
        Reply <strong>HELP</strong> to any FleetGrid message for help, or contact us at{" "}
        <span data-slot="support-contact">
          <a href={`mailto:${support.email}`} className={linkClass}>
            {support.email}
          </a>
          {support.phone && (
            <>
              {" "}
              or{" "}
              <a href={`tel:${support.phone}`} className={linkClass}>
                {formatE164ForDisplay(support.phone)}
              </a>
            </>
          )}
        </span>
        .
      </p>

      <LegalHeading>Carriers</LegalHeading>
      <p>Wireless carriers are not liable for delayed or undelivered messages.</p>

      <LegalHeading>Privacy</LegalHeading>
      <p>
        We do not sell your phone number or share it with third parties for their marketing. See
        our{" "}
        <Link href="/privacy" className={linkClass}>
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/terms" className={linkClass}>
          Terms of Service
        </Link>
        .
      </p>
    </LegalPage>
  );
}
