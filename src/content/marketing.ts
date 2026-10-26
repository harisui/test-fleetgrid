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

/** The home page. */
export const HOME = {
  status: "draft" as CopyStatus,
  hero: {
    eyebrow: "Houston · Pasadena · Port of Houston",
    title: "Local CDL drivers. Shifts filled by text.",
    text: "FleetGrid connects Houston-area carriers with approved Class A and B drivers within 50 miles of the yard. Broadcast a shift, and the first qualified driver to reply YES gets it.",
    primary: { href: "/carriers", label: "Find drivers" },
    secondary: { href: "/login?role=driver", label: "Sign up to drive, free" },
    smallPrint: "Carriers $399 a month, cancel anytime. Free for drivers.",
    optInLine: "Drivers can opt in to receive shift offers by text. See",
    optInLink: { href: "/sms-terms", label: "SMS Terms" },
    /** What a screen reader hears for the animated scene. */
    sceneLabel:
      "A truck drives to a yard. A phone shows a shift offer by text, the driver's reply YES 4821, and the confirmation. The shift is filled.",
    badge: "Shift filled",
  },
  sides: {
    id: "two-sides",
    eyebrow: "Two sides, one grid",
    carrier: {
      eyebrow: "For carriers",
      items: [
        "Search approved drivers by distance, CDL class and endorsements.",
        "Broadcast a shift by text in one step.",
        "Pay drivers directly. No markup on wages.",
      ],
      link: { href: "/carriers", label: "How it works for carriers" },
    },
    driver: {
      eyebrow: "For drivers",
      items: [
        "Free. Sign up on your phone in a few minutes.",
        "Shift offers come by text. Take the ones that fit.",
        "No app to install. No password.",
      ],
      link: { href: "/drivers", label: "How it works for drivers" },
    },
  },
  miles: {
    id: "how-a-shift-gets-filled",
    eyebrow: "How a shift gets filled",
    title: "Four miles from an open shift to a driver on the way.",
    steps: [
      { mile: "Mile 1 · Post", text: "Enter the date, time, yard and the work." },
      {
        mile: "Mile 2 · Broadcast",
        text: "Matching drivers within your distance get a text, sent in random order so no one is favored.",
      },
      {
        mile: "Mile 3 · Claim",
        text: "The first driver to reply YES with the shift code gets it. Everyone else is told it is filled.",
      },
      { mile: "Mile 4 · Work", text: "You confirm the details and pay the driver directly." },
    ],
  },
  who: {
    id: "who-is-on-fleetgrid",
    eyebrow: "Who is on FleetGrid",
    title: "Class A and B CDL drivers, with their card on file.",
    tiles: [
      {
        title: "CDL Class A and B",
        text: "Every driver's class, years with a CDL and driving record are on the card.",
      },
      {
        title: "Endorsements and cards",
        text: "H, N, T and X endorsements, TWIC and DOT medical card status.",
      },
      {
        title: "Equipment",
        text: "Container drayage, dry van, flatbed and reefer, and whether they drive a manual.",
      },
    ],
  },
  review: {
    id: "review-before-visible",
    eyebrow: "Review before visible",
    items: [
      "Every driver answers the same 11 questions.",
      "Drivers can add photos of their CDL and medical card.",
      "FleetGrid reviews each profile before carriers can see it.",
      "Drivers choose whether to receive shift texts and can stop at any time.",
    ],
    /** LEGAL REVIEW */
    smallPrint:
      "Profile review is not a background check or FMCSA driver qualification. Carriers remain responsible for qualifying any driver they work with.",
  },
  area: {
    id: "built-for-houston",
    eyebrow: "Built for the Houston area",
    title: "One region first, so shifts get answered.",
    text: "FleetGrid starts in one region so shifts get answered. If your yard is within 50 miles of Houston or Pasadena, Texas, you can subscribe today. Outside the area, join the waitlist and we will tell you when FleetGrid opens near you.",
    link: { href: "/carriers#service-area", label: "Check your yard's ZIP" },
    mapLabel:
      "A map diagram: two 50-mile rings around Houston and Pasadena, Texas, with the Port of Houston, Baytown, La Porte, Beltway 8 and the Grand Parkway inside them.",
  },
  proof: {
    id: "the-product",
    eyebrow: "The product",
    title: "What drivers and carriers actually see.",
    captions: [
      "The driver card: 11 questions, one mile at a time.",
      "Carrier search: distance, class, endorsements, cards, equipment.",
      "A shift offer by text, and the reply that claims it.",
    ],
  },
  promises: {
    id: "plain-promises",
    eyebrow: "Plain promises",
    items: [
      { title: "No contracts.", text: "Cancel anytime from your account." },
      { title: "Free for drivers.", text: "Carriers pay the subscription." },
      { title: "No wage markup.", text: "Carriers pay drivers directly." },
      {
        title: "Your number is never sold.",
        text: "Your phone number is shared only with the carrier whose shift you claim, when you reply YES.",
      },
      { title: "Reply STOP to stop texts.", text: "Any time, from any message." },
    ],
  },
  finalCta: {
    title: "Ready when you are.",
    primary: { href: "/carriers", label: "Find drivers" },
    secondary: { href: "/login?role=driver", label: "Sign up to drive, free" },
  },
};

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

/** The drivers page. The card list matches the sign-up (src/lib/onboarding/steps.ts). */
export const DRIVERS = {
  status: "draft" as CopyStatus,
  hero: {
    eyebrow: "For drivers · Free",
    title: "Local shifts near home. Sent to your phone.",
    text: "Sign up free in a few minutes. FleetGrid texts you shifts from Houston-area carriers. You decide which ones to take.",
    primary: { href: "/login?role=driver", label: "Sign up free" },
    note: "No app. No password. We text you a code to log in.",
  },
  signUp: {
    id: "sign-up",
    eyebrow: "Sign up on your phone",
    title: "Three steps, no paperwork.",
    steps: [
      {
        title: "Enter your mobile number",
        text: "We text you a code. That is your login, every time.",
      },
      {
        title: "Answer the driver card",
        text: "One mile at a time: About, CDL, Cards, Letters, Equipment, Finish.",
      },
      {
        title: "Add your papers when you are ready",
        text: "Photos of your CDL and medical card can be added from your profile. Carriers reviewing you for a shift can see them.",
      },
    ],
  },
  card: {
    id: "the-card",
    eyebrow: "What the card asks",
    title: "Eleven answers, then one choice about texts.",
    text: "Answer once. Carriers see the same card for every driver, so your experience speaks for itself.",
    items: [
      "Your name",
      "Your ZIP code",
      "How far you will travel for work",
      "Your CDL class, A or B",
      "Years driving with a CDL",
      "Moving violations in the last 3 years",
      "TWIC card",
      "DOT medical card",
      "Endorsements: H, N, T, X",
      "Can you drive a manual",
      "The equipment you run",
    ],
    consent: "Then one box, your choice: shift offers by text. You can finish without it and turn texts on later.",
  },
  texts: {
    id: "shift-texts",
    eyebrow: "How shift offers arrive",
    title: "A text with the date, the time, the place and the work.",
    text: "When a carrier near you posts a shift that matches your card, you get a text. Reply YES and the code to claim it. If someone claimed it first, we text you that it is filled. Texts go out in random order, so no one is always first.",
    stopLine: "Reply STOP at any time to stop texts. Reply HELP for help.",
  },
  free: {
    id: "free",
    eyebrow: "Why it is free for drivers",
    title: "Carriers pay. You never do.",
    text: "Carriers pay a monthly subscription. Drivers never pay to be listed, to get texts or to take a shift. The carrier pays you directly for the work, at the rate you agree on.",
  },
  respect: {
    id: "your-card-your-call",
    eyebrow: "Your card, your call",
    items: [
      "Take only the shifts you want.",
      "Your phone number is shared only with the carrier whose shift you claim, when you reply YES.",
      "We never sell your number.",
      "Delete your profile at any time from your profile page.",
    ],
  },
  outside: {
    id: "outside-houston",
    title: "Outside the Houston area?",
    text: "You can still sign up. If you opted in to texts, we will text you when FleetGrid opens near you.",
  },
  faq: {
    id: "faq",
    eyebrow: "Questions",
    title: "What drivers ask first.",
    more: { href: "/faq#drivers", label: "All driver questions" },
  },
  finalCta: {
    title: "Ready when you are.",
    text: "Sign up on your phone and get listed for local shifts.",
    primary: { href: "/login?role=driver", label: "Sign up free" },
    secondary: { href: "/faq#drivers", label: "Read the driver FAQ" },
  },
};

/** The FAQ page. */
export const FAQ_PAGE = {
  status: "draft" as CopyStatus,
  title: "Questions and answers",
  intro: "Plain answers for carriers and drivers. Anything missing? Send us a message.",
  contact: { href: "/contact", label: "Contact FleetGrid" },
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
