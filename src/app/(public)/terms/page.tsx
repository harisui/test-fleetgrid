import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/layout/LegalPage";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/constants";
import { formatE164ForDisplay } from "@/lib/phone";
import { BUSINESS_NAME, getSupportContact } from "@/lib/support";

export const metadata: Metadata = { title: "Terms of Service" };

const linkClass = "text-foreground underline underline-offset-4";

export default function TermsPage() {
  const contact = getSupportContact();
  return (
    <LegalPage title="Terms of Service" effective={LEGAL_EFFECTIVE_DATE}>
      <p>
        These terms are an agreement between you and {BUSINESS_NAME} (&quot;FleetGrid&quot;,
        &quot;we&quot;, &quot;us&quot;) about your use of the FleetGrid website, service and text
        messages. By creating an account or using the service you agree to them. If you do not
        agree, do not use the service.
      </p>

      <h2>1. What FleetGrid is</h2>
      <p>
        FleetGrid is a confidential directory that connects local freight carriers with certified
        CDL drivers. Drivers create a qualification card and can receive shift offers by text.
        Carriers with an active subscription can search driver cards and send shift offers to
        matching drivers.
      </p>
      <p>
        FleetGrid is not an employer, a staffing agency, a freight broker or a party to any work
        arrangement. Any shift, pay, hours or other terms are agreed directly between the carrier
        and the driver. Carriers are responsible for verifying a driver&apos;s licence, medical
        card and other qualifications before any work, and for complying with all laws that apply
        to them, including FMCSA rules.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must be 18 or older and have a US mobile number to use the service.</li>
        <li>
          You sign in with a one-time code sent to your number. There is no password. Keep your
          phone secure; anyone with access to your number and the code can use your account.
        </li>
        <li>One account per person or company. Do not create an account for someone else.</li>
        <li>You must keep the information in your account true, accurate and up to date.</li>
      </ul>

      <h2>3. Drivers</h2>
      <ul>
        <li>
          Your qualification card (CDL class, years of experience, driving record, TWIC and medical
          card status, endorsements, transmission, equipment and any optional answers) must be true
          and kept current. A false answer may lead to removal from the directory.
        </li>
        <li>
          By completing your card you allow FleetGrid to show it to carriers with an active
          subscription. Your phone number is never shown to carriers; FleetGrid sends the texts.
        </li>
        <li>
          Documents you upload (for example your CDL and medical card) can be seen by you, by
          FleetGrid staff, and by a subscribed carrier reviewing you for a shift.
        </li>
        <li>
          Receiving a shift offer is not an offer of employment and does not guarantee work.
          Accepting a shift is between you and the carrier.
        </li>
      </ul>

      <h2>4. Carriers</h2>
      <ul>
        <li>
          Access to driver cards requires an active subscription, billed monthly. Prices, billing
          and cancellation are shown at checkout and in your billing page. Fees are not refunded
          for partial months.
        </li>
        <li>
          Driver information may be used only to fill your own shifts. You may not copy, scrape,
          resell or share driver data, or contact drivers for any other purpose.
        </li>
        <li>
          You are responsible for your shifts, for the people you hire and for complying with the
          laws that apply to your business.
        </li>
      </ul>

      <h2>5. Text messages</h2>
      <p>
        Drivers choose whether to receive shift offers by text by ticking the consent box during
        sign-up. Message frequency varies and message and data rates may apply. Reply STOP to stop
        and HELP for help. Login codes are sent to everyone who signs in. The full program terms
        are in the{" "}
        <Link href="/sms-terms" className={linkClass}>
          SMS Terms
        </Link>
        .
      </p>

      <h2>6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>give false information about yourself, your qualifications or your company;</li>
        <li>use another person&apos;s number or account, or let someone else use yours;</li>
        <li>harass, threaten or discriminate against anyone you meet through the service;</li>
        <li>interfere with the service, probe its security or access data that is not yours;</li>
        <li>use the service for anything unlawful.</li>
      </ul>

      <h2>7. Review, suspension and removal</h2>
      <p>
        New driver profiles are reviewed by FleetGrid before carriers can see them. We may approve,
        hold, suspend or remove any account or profile at any time, for example for a false answer,
        a complaint from a carrier or driver, or a breach of these terms. We will tell you when we
        can.
      </p>

      <h2>8. Deleting your account</h2>
      <p>
        You can delete your account at any time from your profile page. Your card, documents and
        sign-in are removed for good. We keep a record of your text-message consent and opt-out, as
        US texting rules require, and anything we must keep by law. See the{" "}
        <Link href="/privacy" className={linkClass}>
          Privacy Policy
        </Link>
        .
      </p>

      <h2>9. Our content and your content</h2>
      <p>
        The FleetGrid name, logo, design and software belong to {BUSINESS_NAME}. You keep ownership
        of what you upload and give us permission to store it and show it as these terms describe.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        The service is provided as is. We do not promise that a driver will find work, that a
        carrier will find a driver, that any driver or carrier is who they say they are, or that
        the service will be free of errors or interruptions. We do not check the truth of what
        drivers and carriers enter beyond the review described above.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the extent the law allows, {BUSINESS_NAME} is not liable for indirect, incidental,
        special or consequential damages, lost profits or lost work arising from the service or
        from any shift arranged through it. Our total liability for any claim is limited to the
        amount you paid us in the twelve months before the claim, or one hundred US dollars if you
        paid nothing.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update these terms. The date at the top shows the current version. When a change
        matters, we will ask you to accept the new terms the next time you sign in. Continued use
        after that means you accept them.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These terms are governed by the laws of the Commonwealth of Virginia, United States,
        without regard to its conflict of law rules. Any dispute will be brought in the state or
        federal courts located in Virginia, and you agree to their jurisdiction.
      </p>

      <h2>14. Contact</h2>
      <address className="not-italic">
        <p>
          {BUSINESS_NAME}
          {contact.address.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
        <p>
          <a href={`mailto:${contact.email}`} className={linkClass}>
            {contact.email}
          </a>{" "}
          or{" "}
          <a href={`tel:${contact.phone}`} className={linkClass}>
            {formatE164ForDisplay(contact.phone)}
          </a>
        </p>
      </address>
    </LegalPage>
  );
}
