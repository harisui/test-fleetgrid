import { LAUNCH_LINE } from "@/lib/launch";

/**
 * Every word on the marketing site, in one place, so the client can review it in one
 * sitting. Each page object carries `status: "draft"` until she approves it; the word
 * DRAFT itself is never rendered. Copy rules: plain, short, second person, facts first;
 * no exclamation marks, no dashes, no invented numbers (tests/unit/content/copy-lint).
 */

export type CopyStatus = "draft" | "approved";

export interface SiteLink {
  href: string;
  label: string;
}

/**
 * The toll-free number texts come from. Shown only with NEXT_PUBLIC_SHOW_SMS_NUMBER=true
 * (as the sender) or NEXT_PUBLIC_SHOW_PHONE=true (for calls), both off by default.
 * verify: the number is still in Twilio's toll-free review.
 */
export const SMS_SENDER_NUMBER = "+18888692040";

/** The strip above the header. Uppercase by design, like a highway sign. */
export const LAUNCH_STRIP = {
  status: "draft" as CopyStatus,
  text: "NOW LAUNCHING IN THE HOUSTON AREA · PORT OF HOUSTON, PASADENA, BAYTOWN, LA PORTE.",
  dismissLabel: "Dismiss",
};

export const NAV_LINKS: readonly SiteLink[] = [
  { href: "/carriers", label: "For Carriers" },
  { href: "/drivers", label: "For Drivers" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export const LOGIN_LINK: SiteLink = { href: "/login", label: "Log in" };
export const HEADER_CTA: SiteLink = { href: "/carriers", label: "Find drivers" };

/** The carriers page. Every filter and pricing line was checked against the product (2026-10-15). */
export const CARRIERS = {
  status: "draft" as CopyStatus,
  hero: {
    eyebrow: "For carriers · Houston area",
    title: "Fill open shifts with local drivers who already said yes to texts.",
    text: "Search approved Class A and B CDL drivers near your yard. Broadcast a shift and get a reply by text.",
    primary: { href: "#service-area", label: "Check your yard's ZIP" },
    secondary: { href: "#pricing", label: "See pricing" },
  },
  search: {
    id: "how-it-works",
    eyebrow: "Find qualified drivers",
    title: "Every card answers the same questions, so you can filter on them.",
    text: "You see what each driver entered, and the papers they chose to add.",
    filters: [
      { label: "Distance from your yard", detail: "5 to 250 miles, nearest first" },
      { label: "CDL class", detail: "A, or B and up" },
      { label: "Years of experience", detail: "With a CDL" },
      { label: "Driving record", detail: "Clean, 1 or 2 minor, or 3 or more" },
      { label: "Active TWIC card", detail: "For the port and the terminals" },
      { label: "Current DOT medical card", detail: "Yes or no" },
      { label: "Manual transmission", detail: "Only drivers who can drive one" },
      { label: "Endorsements", detail: "H, N, T and X" },
      { label: "Equipment", detail: "Container drayage, dry van, flatbed, reefer" },
    ],
  },
  broadcast: {
    id: "broadcast",
    eyebrow: "Broadcast Shift",
    title: "One step sends the shift to every matching driver in range.",
    steps: [
      {
        title: "Post the shift",
        text: "The date, the time, the yard and the work. One screen.",
      },
      {
        title: "FleetGrid texts the matches",
        text: "Texts go out in random order so the same people are not always first.",
      },
      {
        title: "The first YES claims it",
        text: "The first driver to reply YES and the code gets the shift. You see who claimed it right away.",
      },
      {
        title: "Everyone else is told",
        text: "The other drivers get a text saying the shift is filled.",
      },
    ],
  },
  pricing: {
    id: "pricing",
    eyebrow: "Pricing",
    title: "One plan, one price.",
    header: "FleetGrid Carrier",
    price: "$399",
    period: "/month",
    included: [
      "Unlimited driver searches",
      "Unlimited shift broadcasts",
      "Driver profiles with the papers drivers add",
      "Search up to 250 miles from your yard",
      "Email support at support@fleetgridus.com",
    ],
    terms: "Billed monthly through Stripe. No contract. Cancel anytime from your account.",
    cta: { href: "#service-area", label: "Check your yard's ZIP" },
    framing:
      "Compare $399 to what one missed shift costs you: a parked truck, a late load, overtime for whoever covers. You know those numbers better than we do.",
  },
  serviceArea: {
    id: "service-area",
    eyebrow: "Service area",
    title: "Is your yard in the launch area?",
    text: "FleetGrid starts within 50 miles of Houston or Pasadena, Texas. Enter your yard's ZIP code to see where you stand.",
    label: "Your yard's ZIP code",
    button: "Check",
    inside: "Good news, your yard is in the launch area.",
    insideCta: { href: "/login?role=carrier", label: "Create your carrier account" },
    outside:
      "FleetGrid is not in your area yet. Create an account to join the waitlist and we will email you when it opens.",
    outsideCta: { href: "/login?role=carrier", label: "Join the waitlist" },
    unknown: "We do not know that ZIP code. Check the five digits.",
    failed: "We could not check that ZIP just now. Please try again.",
  },
  isAndIsNot: {
    id: "what-fleetgrid-is",
    eyebrow: "Plain terms",
    is: {
      title: "FleetGrid is",
      items: [
        "a directory of approved local CDL drivers",
        "a shift-text tool",
        "a monthly subscription",
      ],
    },
    /** LEGAL REVIEW */
    isNot: {
      title: "FleetGrid is not",
      items: [
        "an employer, staffing agency, broker or payroll service",
        "a party to the work: you decide who to work with, you set and pay the rate",
        "a keeper of your driver qualification files: those stay with you",
      ],
    },
  },
  faq: {
    id: "faq",
    eyebrow: "Questions",
    title: "What carriers ask first.",
    more: { href: "/faq#carriers", label: "All carrier questions" },
  },
  finalCta: {
    title: "Ready when you are.",
    text: "Check your yard's ZIP, create your account, and search drivers today.",
    primary: { href: "#service-area", label: "Check your yard's ZIP" },
    secondary: { href: "/contact", label: "Ask us a question" },
  },
};

export const CONTACT = {
  status: "draft" as CopyStatus,
  title: "Contact FleetGrid.",
  /** "usually within one business day" waits for the client to confirm the turnaround. */
  intro: "Questions about the service, your account or a profile review. We reply by email.",
  form: {
    heading: "Send a message",
    name: "Name",
    email: "Email",
    role: "I am a",
    company: "Company",
    companyHint: "Optional",
    message: "Message",
    submit: "Send message",
    submitting: "Sending",
    privacyNote: "We use your details only to reply to your message. See our",
    privacyLink: "Privacy Policy",
    successTitle: "Thanks. Your message was sent.",
    success: (email: string) => `We will reply to ${email}.`,
    error: "Your message did not send. Please try again or email",
    summaryTitle: (count: number) =>
      count === 1 ? "One field needs attention" : `${count} fields need attention`,
  },
  details: {
    heading: "How to reach us",
    email: "Email",
    company: "Company",
    serviceArea: "Service area",
    serviceAreaValue: "Houston and Pasadena, Texas",
    address: "Mailing address",
    phone: "Phone",
  },
};

export const FOOTER = {
  status: "draft" as CopyStatus,
  description:
    "A directory that connects Houston-area carriers with approved CDL drivers, and fills shifts by text.",
  launchLine: LAUNCH_LINE,
  columns: [
    {
      title: "Carriers",
      links: [
        { href: "/carriers#how-it-works", label: "How it works" },
        { href: "/carriers#pricing", label: "Pricing" },
        { href: "/carriers#service-area", label: "Service area" },
      ],
    },
    {
      title: "Drivers",
      links: [
        { href: "/login?role=driver", label: "Sign up free" },
        { href: "/drivers#shift-texts", label: "Shift texts" },
        { href: "/faq", label: "FAQ" },
      ],
    },
  ] as const satisfies readonly { title: string; links: readonly SiteLink[] }[],
  company: { title: "Company", links: [{ href: "/contact", label: "Contact" }] as const },
  legal: [
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
    { href: "/sms-terms", label: "SMS Terms" },
  ] as const satisfies readonly SiteLink[],
  /** After the copyright. The company name comes from src/lib/support.ts. */
  legalLine:
    "FleetGrid is a directory and messaging service. FleetGrid is not an employer, staffing agency or freight broker.",
  /** The sender is named only when NEXT_PUBLIC_SHOW_SMS_NUMBER=true. */
  smsLine: {
    withNumber: (number: string) =>
      `Shift texts are sent from ${number} to drivers who opt in. Reply STOP to opt out, HELP for help. Message and data rates may apply.`,
    withoutNumber:
      "Shift texts go to drivers who opt in. Reply STOP to opt out, HELP for help. Message and data rates may apply.",
  },
};
