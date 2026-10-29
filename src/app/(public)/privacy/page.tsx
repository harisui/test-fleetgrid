import type { Metadata } from "next";
import Link from "next/link";
import { LegalHeading, LegalPage } from "@/components/layout/LegalPage";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/constants";
import { formatE164ForDisplay } from "@/lib/phone";
import { BUSINESS_NAME, getSupportContact } from "@/lib/support";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/privacy");

const linkClass = "text-foreground underline underline-offset-4";

/** The section headings, in order, for the table of contents. Each one is a LegalHeading below. */
export const PRIVACY_SECTIONS = [
  "1. What we collect",
  "2. How we use it",
  "3. Who can see your information",
  "4. Text messages",
  "5. How long we keep it",
  "6. Security",
  "7. Your choices",
  "8. Children",
  "9. Data sources",
  "10. Changes",
  "11. Contact",
] as const;

/**
 * Twilio's required wording for the opt-in data, verbatim (toll-free verification, 2026-10-14).
 * Not to be reworded.
 */
export const SMS_OPT_IN_DATA_CLAUSE =
  "All the above categories exclude text messaging originator opt-in data and consent; this information won't be shared with any third parties.";

export default function PrivacyPage() {
  const contact = getSupportContact();
  return (
    <LegalPage
      path="/privacy"
      title="Privacy Policy"
      effective={LEGAL_EFFECTIVE_DATE}
      sections={PRIVACY_SECTIONS}
    >
      <p>
        This policy explains what {BUSINESS_NAME} (&quot;FleetGrid&quot;, &quot;we&quot;,
        &quot;us&quot;) collects when you use the FleetGrid website, service and text messages,
        what we do with it, and the choices you have.
      </p>

      <LegalHeading>1. What we collect</LegalHeading>
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
          <strong>Clearinghouse and SAP self-report</strong> (drivers, optional): drivers may
          self-report their Clearinghouse and SAP status. We store only a yes or no answer and
          the date, not any violation details. A driver can withdraw it from their profile, which
          deletes it. It is not shown to carriers.
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
          <strong>How you found us</strong>: we record how you found FleetGrid, such as a flyer, ad
          or website link, to improve our outreach. The link you arrived by and the page you landed
          on are kept in a cookie for 30 days and saved with your profile when you sign up. Drivers
          may also tell us where they heard of FleetGrid; the question is optional.
        </li>
        <li>
          <strong>Technical data</strong>: server logs with your IP address and browser, and three
          cookies: one that keeps you signed in, one that remembers light or dark mode, and the
          30-day one above that remembers how you found us. When you scan one of our flyers, we
          count the scan with a one-way hash of your address, never the address itself. The
          site also loads the Google Ads tag, which sets Google&apos;s cookies so we can tell
          whether an ad brought you here and whether you signed up. Page counts come from Vercel
          Analytics, which sets no cookie. We use no other advertising or analytics trackers.
        </li>
      </ul>

      <LegalHeading>2. How we use it</LegalHeading>
      <ul>
        <li>To sign you in and keep your account secure.</li>
        <li>To build the directory: showing driver cards to subscribed carriers.</li>
        <li>To send shift offers and related texts to drivers who opted in.</li>
        <li>To review new profiles and keep the directory accurate.</li>
        <li>To bill carriers and keep accounting records.</li>
        <li>To answer support requests and to meet legal obligations.</li>
      </ul>

      <LegalHeading>3. Who can see your information</LegalHeading>
      <ul>
        <li>
          <strong>Carriers with an active subscription</strong> can see a driver&apos;s
          qualification card and, when reviewing that driver for a shift, the documents the driver
          uploaded. Your phone number is shared only with the carrier whose shift you claim, when
          you reply YES.
        </li>
        <li>
          <strong>FleetGrid staff</strong> can see accounts, cards and documents to review profiles
          and give support.
        </li>
        <li>
          <strong>Service providers</strong> that run the service for us: Supabase (database,
          sign-in and file storage), Vercel (hosting), Twilio (text messages), Stripe (carrier
          payments), Google (ad measurement) and Vercel Analytics (page counts without cookies).
          They may only use your data to provide their service to us.
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
      <p data-slot="opt-in-data-clause">{SMS_OPT_IN_DATA_CLAUSE}</p>
      {/* The sentence above is Twilio's exact wording; the apostrophe in "won't" is intended. */}

      <LegalHeading>4. Text messages</LegalHeading>
      <p>
        Drivers opt in to shift offers by checking a box during sign-up. Reply STOP to any message to
        stop, START to begin again and HELP for help. Login codes are sent to everyone who signs in.
        The program terms are in the{" "}
        <Link href="/sms-terms" className={linkClass}>
          SMS Terms
        </Link>
        .
      </p>

      <LegalHeading>5. How long we keep it</LegalHeading>
      <p>
        We keep your account, card and documents while your account exists. When you delete your
        account, they are removed for good. We keep a record of text-message consent and opt-outs,
        including the phone number and time, as US texting rules require, even after an account is
        deleted, along with billing records and anything else the law requires us to keep.
      </p>

      <LegalHeading>6. Security</LegalHeading>
      <p>
        Data travels over encrypted connections and is stored with per-user access rules, so an
        account can only read and change its own data. Documents are kept in private storage and
        opened only through short-lived links. No system is perfectly secure; tell us at once if
        you think your account has been misused.
      </p>

      <LegalHeading>7. Your choices</LegalHeading>
      <ul>
        <li>Change any answer on your card from your profile page at any time.</li>
        <li>Remove a document from the Documents page.</li>
        <li>Stop shift texts by replying STOP.</li>
        <li>Delete your account from your profile page.</li>
        <li>Ask us what we hold about you, or to correct it, at the address below.</li>
      </ul>

      <LegalHeading>8. Children</LegalHeading>
      <p>The service is for adults 18 and older. We do not knowingly collect data from children.</p>

      <LegalHeading>9. Data sources</LegalHeading>
      <p>
        ZIP code, city and state data comes from{" "}
        <a
          href="https://www.geonames.org/"
          className="text-foreground underline underline-offset-4"
          rel="noopener noreferrer"
          target="_blank"
        >
          GeoNames
        </a>
        , used under the Creative Commons Attribution 4.0 license. It is stored on our servers and
        is never sent to a third party.
      </p>

      <LegalHeading>10. Changes</LegalHeading>
      <p>
        We may update this policy. The date at the top shows the current version, and we will tell
        you in the app when a change matters.
      </p>

      <LegalHeading>11. Contact</LegalHeading>
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
