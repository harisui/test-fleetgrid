/**
 * Search and sharing copy for every public page, in one table: the page metadata, the
 * sitemap, the breadcrumbs and the share images all read from here. Titles follow the
 * brief (section 7) with the launch scope applied: Class A and B CDL drivers only, so no
 * yard spotters or mechanics. Status: draft, like the rest of the site copy.
 */

export type SeoPath = "/" | "/carriers" | "/drivers" | "/faq" | "/contact" | "/terms" | "/privacy" | "/sms-terms";

export interface SeoPage {
  path: SeoPath;
  /** The browser title. The home page's is absolute; the others get " | FleetGrid". */
  title: string;
  /** About 150 characters, factual. */
  description: string;
  /** The breadcrumb name. */
  name: string;
  /** The share image: a short eyebrow and a headline. */
  og: { eyebrow: string; headline: string };
  /** How often the page changes, for the sitemap. */
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
}

export const SEO_PAGES: readonly SeoPage[] = [
  {
    path: "/",
    title: "FleetGrid: Local CDL Drivers for Open Shifts in Houston",
    description:
      "Houston-area carriers find approved Class A and B CDL drivers within 50 miles of the yard and fill shifts by text. Free for drivers.",
    name: "Home",
    og: { eyebrow: "Houston · Pasadena · Port of Houston", headline: "Local CDL drivers. Shifts filled by text." },
    changeFrequency: "weekly",
    priority: 1,
  },
  {
    path: "/carriers",
    title: "Find CDL Drivers in Houston for Open Shifts",
    description:
      "Search approved local drivers near your Houston or Pasadena yard and broadcast shifts by text. $399 a month, no contract, cancel anytime.",
    name: "For Carriers",
    og: { eyebrow: "For carriers · Houston area", headline: "Fill open shifts with local CDL drivers." },
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    path: "/drivers",
    title: "CDL Driver Shifts in Houston and Pasadena, TX",
    description:
      "Sign up free on your phone. Get local shift offers by text from Houston-area carriers, including the Port of Houston, Baytown and La Porte.",
    name: "For Drivers",
    og: { eyebrow: "For drivers · Free", headline: "Local shifts near home. Sent to your phone." },
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    path: "/faq",
    title: "FAQ for Carriers and Drivers",
    description:
      "Plain answers about pricing, the service area, profile review, shift texts, STOP and HELP, and how payment works on FleetGrid.",
    name: "FAQ",
    og: { eyebrow: "Questions and answers", headline: "Plain answers for carriers and drivers." },
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/contact",
    title: "Contact FleetGrid",
    description:
      "Questions about FleetGrid in the Houston area? Send a message or email support@fleetgridus.com. FleetGrid LLC.",
    name: "Contact",
    og: { eyebrow: "Contact", headline: "Questions about FleetGrid? Send a message." },
    changeFrequency: "yearly",
    priority: 0.5,
  },
  {
    path: "/terms",
    title: "Terms of Service",
    description: "The terms for carriers and drivers using FleetGrid, the directory and shift text service run by FleetGrid LLC.",
    name: "Terms of Service",
    og: { eyebrow: "Legal", headline: "Terms of Service" },
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    description: "What FleetGrid collects, who can see it, how text consent is recorded, and how to delete your profile.",
    name: "Privacy Policy",
    og: { eyebrow: "Legal", headline: "Privacy Policy" },
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    path: "/sms-terms",
    title: "SMS Terms",
    description: "FleetGrid Shift Alerts: what the texts are, how often they come, and how to reply STOP or HELP. Msg & data rates may apply.",
    name: "SMS Terms",
    og: { eyebrow: "Legal", headline: "SMS Terms" },
    changeFrequency: "yearly",
    priority: 0.3,
  },
];

export function seoPage(path: SeoPath): SeoPage {
  const page = SEO_PAGES.find((candidate) => candidate.path === path);
  if (!page) throw new Error(`No SEO entry for ${path}`);
  return page;
}

/** The line at the foot of every share image. */
export const OG_FOOTER = "fleetgridus.com · Houston area";
