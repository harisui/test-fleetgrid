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
