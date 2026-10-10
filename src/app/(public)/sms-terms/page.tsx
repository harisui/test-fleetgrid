import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/layout/LegalPage";
import { SMS_CONSENT_TEXT, SMS_PROGRAM_NAME } from "@/lib/constants";
import { formatE164ForDisplay } from "@/lib/phone";
import { BUSINESS_NAME, getSupportContact } from "@/lib/support";

export const metadata: Metadata = { title: "SMS Terms" };

const linkClass = "text-foreground underline underline-offset-4";

/** SMS program disclosure for carrier registration (toll-free verification and A2P 10DLC). */
export default function SmsTermsPage() {
  const support = getSupportContact();
  return (
    <LegalPage title="SMS Terms">
      <h2>Program name</h2>
      <p>
        {SMS_PROGRAM_NAME}, sent by {BUSINESS_NAME}.
      </p>

      <h2>What messages we send</h2>
      <p>
        FleetGrid texts drivers who have opted in about available work shifts that match their
        qualification card, and sends follow-up messages about those shifts, such as a confirmation
        when you claim one or a notice that a shift has been filled. We also text one-time login
        codes when you sign in. We do not send marketing messages.
      </p>

      <h2>How you opt in</h2>
      <p>Drivers opt in during sign-up by ticking an unchecked box next to this statement:</p>
      <blockquote className="border-border text-muted-foreground border-l-4 pl-4">
        {SMS_CONSENT_TEXT}
      </blockquote>
      <p>Consent to receive text messages is not a condition of any purchase.</p>

      <h2>Message frequency</h2>
      <p>
        Message frequency varies. It depends on how many matching shifts are posted in your area.
      </p>

      <h2>Cost</h2>
      <p>Msg &amp; data rates may apply. FleetGrid does not charge drivers for messages.</p>

      <h2>How to opt out</h2>
      <p>
        Reply <strong>STOP</strong> to any FleetGrid message to stop receiving shift offers. You
        will get one message confirming that you are unsubscribed. To start again, reply{" "}
        <strong>START</strong>.
      </p>

      <h2>Help</h2>
      <p>
        Reply <strong>HELP</strong> to any FleetGrid message for help, or contact us at{" "}
        <span data-slot="support-contact">
          <a href={`mailto:${support.email}`} className={linkClass}>
            {support.email}
          </a>{" "}
          or{" "}
          <a href={`tel:${support.phone}`} className={linkClass}>
            {formatE164ForDisplay(support.phone)}
          </a>
        </span>
        .
      </p>

      <h2>Carriers</h2>
      <p>Mobile carriers are not liable for delayed or undelivered messages.</p>

      <h2>Privacy</h2>
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
