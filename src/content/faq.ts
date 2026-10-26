import { SUBSCRIPTION_PRICE_LABEL } from "@/lib/constants";
import type { CopyStatus } from "@/content/marketing";

/**
 * Every question and answer on /faq, in one place. The carriers and drivers pages show five
 * each, linking here by anchor. All answers are plain text so the HTML carries them whole.
 * DRAFT for client approval; LEGAL REVIEW and CLIENT INPUT notes sit in the comments only.
 */

export interface FaqEntry {
  /** The anchor on /faq. */
  id: string;
  question: string;
  answer: string;
}

export interface FaqGroup {
  id: string;
  title: string;
  entries: readonly FaqEntry[];
}

export const FAQ_STATUS: CopyStatus = "draft";

export const FAQ_CARRIERS: FaqGroup = {
  id: "carriers",
  title: "For carriers",
  entries: [
    {
      id: "carrier-cost",
      question: "What does FleetGrid cost?",
      answer: `${SUBSCRIPTION_PRICE_LABEL}, billed through Stripe. No contract. Cancel anytime from your account.`,
    },
    {
      id: "carrier-cancel",
      question: "How do I cancel?",
      answer:
        "Open Billing in your account and choose Manage billing. Stripe's portal lets you cancel in two taps. Your access runs to the end of the month you paid for.",
    },
    {
      id: "carrier-area",
      question: "What area does FleetGrid cover?",
      answer:
        "Yards within 50 miles of Houston or Pasadena, Texas. That takes in the Port of Houston, Baytown and La Porte.",
    },
    {
      id: "carrier-outside",
      question: "What happens if my yard is outside the area?",
      answer:
        "You can still create an account. It goes on the waitlist at no charge, and we email you when FleetGrid opens near you.",
    },
    {
      id: "carrier-approval",
      question: "How are drivers approved?",
      answer:
        "FleetGrid staff review every new card before carriers can see it: the answers are checked for completeness and plausibility. Approved cards are listed; the rest are held.",
    },
    {
      // LEGAL REVIEW
      id: "carrier-checks",
      question: "Does FleetGrid run background checks or MVRs?",
      answer:
        "No. FleetGrid reviews the card a driver fills in. You run your own checks, verify the licence and medical card, and keep your own driver qualification files, as FMCSA rules require of you.",
    },
    {
      id: "carrier-broadcast",
      question: "How does Broadcast Shift choose who gets texted?",
      answer:
        "Drivers whose card matches the shift, whose travel distance reaches your yard, and who opted in to texts. They are texted in random order, so the same drivers are not always first.",
    },
    {
      id: "carrier-two-yes",
      question: "What if two drivers reply YES?",
      answer:
        "The first valid reply wins. Every other driver gets a text saying the shift was filled.",
    },
    {
      id: "carrier-pay",
      question: "How do I pay the driver?",
      answer:
        "Directly, the way you pay anyone who works a shift for you. FleetGrid does not handle pay and takes nothing from it.",
    },
    {
      // LEGAL REVIEW
      id: "carrier-employee",
      question: "Is the driver my employee or FleetGrid's?",
      answer:
        "Not FleetGrid's. How you classify and engage a driver is between you and the driver. FleetGrid is a directory and a messaging service, not an employer or a staffing agency.",
    },
    {
      id: "carrier-other-work",
      question: "Can I post shifts for other kinds of work?",
      answer:
        "At launch FleetGrid lists Class A and B CDL drivers only. Other roles come later, and we will say so here when they do.",
    },
    {
      id: "carrier-help",
      question: "Who do I contact for help?",
      answer: "Email support@fleetgridus.com, or use the contact page. We reply by email.",
    },
  ],
};

export const FAQ_DRIVERS: FaqGroup = {
  id: "drivers",
  title: "For drivers",
  entries: [
    {
      id: "driver-free",
      question: "Is FleetGrid really free for drivers?",
      answer:
        "Yes, always. Carriers pay the subscription. You never pay to be listed, to get texts or to take a shift.",
    },
    {
      id: "driver-cdl",
      question: "Do I need a CDL to sign up?",
      answer: "Yes. At launch FleetGrid lists drivers with a Class A or Class B CDL.",
    },
    {
      id: "driver-endorsements",
      question: "Which endorsements and cards can I list?",
      answer:
        "The H, N, T and X endorsements, whether you drive a manual, your TWIC card and DOT medical card status, and the equipment you run: container drayage, dry van, flatbed and reefer.",
    },
    {
      id: "driver-papers",
      question: "Why do you ask for my CDL and medical card?",
      answer:
        "You do not have to add them to sign up. Photos of your CDL and medical card can be added from your profile when you are ready, and a carrier reviewing you for a shift can see them.",
    },
    {
      // CLIENT INPUT: the turnaround. No promise until the client gives one.
      id: "driver-approval-time",
      question: "How long does approval take?",
      answer:
        "FleetGrid staff review cards as they come in. Your profile page shows your status, and carriers can find you once it reads Approved.",
    },
    {
      id: "driver-texts",
      question: "How do shift texts work?",
      answer:
        "When a carrier near you posts a shift that matches your card, you get a text with the date, time, place and the work. Reply YES and the code to claim it. If someone claimed it first, we text you that it is filled.",
    },
    {
      id: "driver-first-yes",
      question: "What does first YES wins mean?",
      answer:
        "Several drivers get the same offer. The first one whose YES and code reach FleetGrid gets the shift.",
    },
    {
      id: "driver-filled",
      question: "Why did I get a shift filled text?",
      answer:
        "Another driver replied before you. Texts go out in random order, so no one is always first.",
    },
    {
      id: "driver-pay",
      question: "Who pays me, and how much?",
      answer:
        "The carrier pays you directly, at the rate you agree with them. FleetGrid never touches pay and never takes a cut.",
    },
    {
      // LEGAL REVIEW
      id: "driver-employee",
      question: "Am I a FleetGrid employee?",
      answer:
        "No. FleetGrid is a directory and a messaging service. Any work you take is between you and the carrier.",
    },
    {
      id: "driver-outside",
      question: "I live outside the Houston area. Can I sign up?",
      answer:
        "Yes. Your card goes on the list, and if you opted in to texts we will text you when FleetGrid opens near you.",
    },
    {
      id: "driver-profile",
      question: "How do I update or delete my profile?",
      answer:
        "From your profile page. Every answer can be changed there, and Delete my account removes your card, your papers and your sign-in for good.",
    },
  ],
};

export const FAQ_TEXTS: FaqGroup = {
  id: "texts",
  title: "Texts and privacy",
  entries: [
    {
      id: "texts-stop",
      question: "How do I stop texts?",
      answer:
        "Reply STOP to any FleetGrid text. You get one message confirming it. Reply START to begin again.",
    },
    {
      id: "texts-help",
      question: "How do I get help?",
      answer: "Reply HELP to any FleetGrid text, or email support@fleetgridus.com.",
    },
    {
      id: "texts-frequency",
      question: "How often will you text me?",
      answer:
        "Message frequency varies. It depends on how many matching shifts are posted in your area.",
    },
    {
      id: "texts-required",
      question: "Do I have to agree to texts to sign up?",
      answer:
        "No. You can finish your card without agreeing to texts. You then will not get shift offers until you turn texts on from your profile.",
    },
    {
      id: "texts-sell",
      question: "Does FleetGrid sell my phone number?",
      answer:
        "No. In the words of our privacy policy: we do not sell your personal information, and we do not share your phone number with third parties for their own marketing.",
    },
    {
      id: "texts-documents",
      question: "Will carriers see my documents?",
      answer:
        "Only a carrier with an active subscription who is reviewing you for a shift, and FleetGrid staff. Your phone number is shared only with the carrier whose shift you claim, when you reply YES.",
    },
    {
      id: "texts-rates",
      question: "Do message and data rates apply?",
      answer:
        "They may, depending on your mobile plan. FleetGrid does not charge drivers for messages.",
    },
  ],
};

export const FAQ_GROUPS: readonly FaqGroup[] = [FAQ_CARRIERS, FAQ_DRIVERS, FAQ_TEXTS];

export function faqEntry(id: string): FaqEntry {
  for (const group of FAQ_GROUPS) {
    const entry = group.entries.find((candidate) => candidate.id === id);
    if (entry) return entry;
  }
  throw new Error(`Unknown FAQ entry: ${id}`);
}

/** The five questions each audience page shows, linking to /faq. */
export const CARRIER_FAQ_EXCERPT = [
  "carrier-cost",
  "carrier-area",
  "carrier-outside",
  "carrier-broadcast",
  "carrier-pay",
].map(faqEntry);

export const DRIVER_FAQ_EXCERPT = [
  "driver-free",
  "driver-cdl",
  "driver-texts",
  "driver-pay",
  "driver-outside",
].map(faqEntry);
