/**
 * The Terms of Service, one entry per published version (Milestone 6, part 1). The `body` is the
 * exact text a person reads on /terms, on the driver's acceptance page and in the archive
 * (`terms_versions`, migration 0040): the page renders it, and the database stores it with its
 * SHA-256. A published version's text never changes: a correction is a new version.
 *
 * This is the client's and the attorney's wording, so it lives outside the marketing copy
 * linter (which reads only the top level of src/content). Contact details are written into
 * the text, because a legal text does not change with an environment variable.
 *
 * The body is a small markdown: "## " headings, paragraphs, "- " lists (two spaces in for a
 * list inside an item, or to continue an item's text), [links](/path), and a line ending in a
 * backslash for a line break (the address).
 */

export interface TermsVersion {
  /** Stored with every acceptance. */
  version: string;
  title: string;
  /** ISO date the text takes effect. */
  effectiveDate: string;
  /** The same date as people read it: "October 29, 2026". */
  effectiveLabel: string;
  /**
   * True when everyone must accept this version again before going on (drivers' shift offers
   * pause until they do). False for a version that only new accounts accept.
   */
  requiresReacceptance: boolean;
  body: string;
}

const TERMS_2026_10_V2: TermsVersion = {
  version: "2026-10-v2",
  title: "Terms of Service",
  effectiveDate: "2026-10-29",
  effectiveLabel: "October 29, 2026",
  requiresReacceptance: false,
  body: `These terms are an agreement between you and FleetGrid LLC ("FleetGrid", "we", "us") about your use of the FleetGrid website, service and text messages. By creating an account or using the service you agree to them. If you do not agree, do not use the service.

## 1. What is FleetGrid?

FleetGrid is a platform where local freight carriers post open shifts and local CDL drivers book them. Drivers create a qualification card and can receive new shifts by text. Carriers with an active subscription can search driver cards and post shifts, and FleetGrid notifies qualified drivers on our platform.

FleetGrid is not an employer, a staffing agency, a freight broker or a party to any work arrangement. Any shift, pay, hours or other terms are agreed directly between the carrier and the driver. Carriers are responsible for verifying a driver's licence, medical card and other qualifications before any work, and for complying with all laws that apply to them, including FMCSA rules.

## 2. Accounts

- You must be 18 years old or older and have a US mobile number to use the service.
- You sign in with a one-time code sent to your number. There is no password. Keep your phone secure; anyone with access to your number and the code can use your account.
- One account per person or company. Do not create an account for someone else.
- You must keep the information in your account true, accurate and up to date.

## 3. Drivers

- Your qualification card (CDL class, years of experience, driving record, TWIC and medical card status, endorsements, transmission, equipment and any optional answers) must be true and kept current. A false answer may lead to removal from the directory.
- By completing your card you allow FleetGrid to show it to carriers with an active subscription. Your phone number is shared only with the carrier whose shift you book, when you reply YES.
- Only you and FleetGrid staff can see your documents. A company you book a shift with can view your CDL and medical card for that shift.
- Receiving a shift offer is not an offer of employment and does not guarantee work. Accepting a shift is between you and the carrier.
- FleetGrid does not pay wages, withhold taxes, manage schedules, or issue tax forms (W-2/1099) to drivers. All work, payment, and engagement terms are strictly between you and the carrier.

## 4. Carriers

- Access to driver cards requires an active subscription, billed monthly. Prices, billing and cancellation are shown at checkout and in your billing page. Fees are not refunded for partial months.
- Driver information may be used only to fill your own shifts. You may not copy, scrape, resell or share driver data, or contact drivers for any other purpose.
- Driver contact details you receive from a booked shift may be used only to arrange that shift. You may not store, share or resell them, or use them to engage drivers outside FleetGrid.
- If a driver does not show up for a booked shift, release the shift in FleetGrid so it can be offered again. No-shows are recorded against the driver.
- Carriers maintain sole responsibility for evaluating, qualifying and managing all drivers. FleetGrid provides directory matching only. Before assigning any shift, you are solely responsible for:
  - verifying the driver's CDL, DOT medical card, TWIC, MVR record and FMCSA Clearinghouse status;
  - creating and maintaining all FMCSA-required Driver Qualification (DQ) files;
  - supplying appropriate commercial insurance and maintaining compliance with all federal, state and local transportation laws;
  - setting pay rates, managing tax classifications (W-2 or 1099) and paying drivers directly.
- You are fully responsible for your shifts, equipment, operations and the personnel you engage.

## 5. Text messages

Drivers choose whether to receive shift offers by text by checking the consent box during sign-up. Message frequency varies and message and data rates may apply. Reply STOP to stop and HELP for help. Login codes are sent to everyone who signs in. The full program terms are in the [SMS Terms](/sms-terms).

## 6. Acceptable use

You agree not to:

- give false information about yourself, your qualifications or your company;
- use another person's number or account, or let someone else use yours;
- harass, threaten or discriminate against anyone you meet through the service;
- interfere with the service, probe its security or access data that is not yours;
- use the service for anything unlawful.

## 7. Review, suspension and removal

New driver profiles are reviewed by FleetGrid before carriers can see them. We may list, hold, suspend or remove any account or profile at any time, for example for a false answer, a complaint from a carrier or driver, or a breach of these terms. We will notify you when we become aware.

## 8. Deleting your account

You can delete your account at any time from your profile page. Your card, documents and sign-in are removed permanently. We keep a record of your text-message consent and opt-out, as US texting rules require, and anything we must keep by law. See the [Privacy Policy](/privacy).

## 9. Our content and your content

The FleetGrid name, logo, design and software belong to FleetGrid LLC. You keep ownership of what you upload and give us permission to store it and show it as these terms describe.

## 10. Disclaimers

The service is provided as is. We do not promise that a driver will find work, that a carrier will find a driver, that any driver or carrier is who they say they are, or that the service will be free of errors or interruptions. We do not check the truth of what drivers and carriers enter beyond the review described above.

## 11. Limitation of liability

To the extent the law allows, FleetGrid LLC is not liable for indirect, incidental, special or consequential damages, lost profits or lost work arising from the service or from any shift arranged through it. Our total liability for any claim is limited to the amount you paid us in the twelve months before the claim, or one hundred US dollars if you paid nothing.

## 12. Changes

We may update these terms. The date at the top shows the current version. When a change matters, we will ask you to accept the new terms the next time you sign in. Continued use after that means you accept them.

## 13. Governing law and dispute resolution

These terms are governed by the laws of the Commonwealth of Virginia, United States, without regard to its conflict of law rules. Any dispute, claim or controversy arising out of or relating to these terms or the service shall be resolved by final and binding individual arbitration administered by the American Arbitration Association (AAA) under its Commercial Rules, rather than in court, except that either party may bring claims in small claims court in Virginia if qualified.

You and FleetGrid agree that any dispute resolution proceedings will be conducted only on an individual basis and not in a class, consolidated, or representative action. If any legal action or arbitration arises under these terms, the prevailing party shall be entitled to recover its reasonable attorneys’ fees and costs from the non-prevailing party. If an arbitrable claim proceeds in court for any reason, all disputes will be brought exclusively in the state or federal courts located in Virginia, and you agree to their jurisdiction.

## 14. Contact

FleetGrid LLC\\
8401 Mayland Dr. STE A\\
Richmond, VA 23294

[support@fleetgridus.com](mailto:support@fleetgridus.com)
`,
};

/** Every published version, oldest first. Append only. */
export const TERMS_VERSIONS: readonly TermsVersion[] = [TERMS_2026_10_V2];

/** The version on /terms, accepted at sign-up and by carriers. */
export const CURRENT_TERMS: TermsVersion = TERMS_VERSIONS[TERMS_VERSIONS.length - 1];
