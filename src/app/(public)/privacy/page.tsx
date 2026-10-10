import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/layout/LegalPage";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/constants";
import { formatE164ForDisplay } from "@/lib/phone";
import { BUSINESS_NAME, getSupportContact } from "@/lib/support";

export const metadata: Metadata = { title: "Privacy Policy" };

const linkClass = "text-foreground underline underline-offset-4";

export default function PrivacyPage() {
  const contact = getSupportContact();
  return (
    <LegalPage title="Privacy Policy" effective={LEGAL_EFFECTIVE_DATE}>
      <p>
        This policy explains what {BUSINESS_NAME} (&quot;FleetGrid&quot;, &quot;we&quot;,
        &quot;us&quot;) collects when you use the FleetGrid website, service and text messages,
        what we do with it, and the choices you have.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <strong>Your mobile number</strong>, used to sign you in with a one-time code and, if you
          are a driver who opted in, to text you shift offers.
        </li>
        <li>
          <strong>Your qualification card</strong> (drivers): your name, ZIP code, how far you will
          travel, CDL class, years of experience, driving record, TWIC and medical card status,
          endorsements, transmission, equipment, and any optional answers you add on your profile
          (W-2 or 1099, kind of driving, Clearinghouse registration, availability, certifications,
          a short description). Your city, state and map coordinates are looked up from your ZIP
          code; you do not type them.
        </li>
        <li>
          <strong>Documents you upload</strong> (drivers): photos or PDFs of your CDL, medical card
          and other papers.
        </li>
        <li>
          <strong>Company details</strong> (carriers): company name, contact name, billing email,
          USDOT and MC numbers if given, and yard address. Payments are handled by our payment
          provider; we do not store card numbers.
        </li>
        <li>
          <strong>Consent records</strong>: the exact text you agreed to, the version, your number
          and the time, for text-message consent and for the Terms.
        </li>
        <li>
          <strong>Technical data</strong>: server logs with your IP address and browser, and two
          cookies, one that keeps you signed in and one that remembers light or dark mode. We use
          no advertising or analytics trackers.
        </li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>To sign you in and keep your account secure.</li>
        <li>To build the directory: showing driver cards to subscribed carriers.</li>
        <li>To send shift offers and related texts to drivers who opted in.</li>
        <li>To review new profiles and keep the directory accurate.</li>
        <li>To bill carriers and keep accounting records.</li>
        <li>To answer support requests and to meet legal obligations.</li>
      </ul>

      <h2>3. Who can see your information</h2>
      <ul>
        <li>
          <strong>Carriers with an active subscription</strong> can see a driver&apos;s
          qualification card and, when reviewing that driver for a shift, the documents the driver
          uploaded. A driver&apos;s phone number is never shown to carriers; FleetGrid sends the
          texts.
        </li>
        <li>
          <strong>FleetGrid staff</strong> can see accounts, cards and documents to review profiles
          and give support.
        </li>
        <li>
          <strong>Service providers</strong> that run the service for us: Supabase (database,
          sign-in and file storage), Vercel (hosting), Twilio (text messages) and Stripe (carrier
          payments). They may only use your data to provide their service to us.
        </li>
        <li>
          <strong>Legal requests</strong>: we may disclose information when the law requires it or
          to protect the safety of our users.
        </li>
      </ul>
      <p>
        We do not sell your personal information, and we do not share your phone number with third
        parties for their own marketing. Text-message consent and opt-in information is never
        shared with anyone for marketing.
      </p>

      <h2>4. Text messages</h2>
      <p>
        Drivers opt in to shift offers by ticking a box during sign-up. Reply STOP to any message to
        stop, START to begin again and HELP for help. Login codes are sent to everyone who signs in.
        The program terms are in the{" "}
        <Link href="/sms-terms" className={linkClass}>
          SMS Terms
        </Link>
        .
      </p>

      <h2>5. How long we keep it</h2>
      <p>
        We keep your account, card and documents while your account exists. When you delete your
        account, they are removed for good. We keep a record of text-message consent and opt-outs,
        including the phone number and time, as US texting rules require, even after an account is
        deleted, along with billing records and anything else the law requires us to keep.
      </p>

      <h2>6. Security</h2>
      <p>
        Data travels over encrypted connections and is stored with per-user access rules, so an
        account can only read and change its own data. Documents are kept in private storage and
        opened only through short-lived links. No system is perfectly secure; tell us at once if
        you think your account has been misused.
      </p>

      <h2>7. Your choices</h2>
      <ul>
        <li>Change any answer on your card from your profile page at any time.</li>
        <li>Remove a document from the Documents page.</li>
        <li>Stop shift texts by replying STOP.</li>
        <li>Delete your account from your profile page.</li>
        <li>Ask us what we hold about you, or to correct it, at the address below.</li>
      </ul>

      <h2>8. Children</h2>
      <p>The service is for adults 18 and older. We do not knowingly collect data from children.</p>

      <h2>9. Data sources</h2>
      <p className="text-small leading-small text-muted-foreground">
        ZIP code, city and state data comes from{" "}
        <a
          href="https://www.geonames.org/"
          className="underline underline-offset-4"
          rel="noopener noreferrer"
          target="_blank"
        >
          GeoNames
        </a>
        , used under the Creative Commons Attribution 4.0 license. It is stored on our servers and
        is never sent to a third party.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update this policy. The date at the top shows the current version, and we will tell
        you in the app when a change matters.
      </p>

      <h2>11. Contact</h2>
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
          </a>
          {contact.phone && (
            <>
              {" "}
              or{" "}
              <a href={`tel:${contact.phone}`} className={linkClass}>
                {formatE164ForDisplay(contact.phone)}
              </a>
            </>
          )}
        </p>
      </address>
    </LegalPage>
  );
}
