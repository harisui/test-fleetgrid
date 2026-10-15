import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CarriersPage from "@/app/(public)/carriers/page";
import LandingPage from "@/app/(public)/page";
import PrivacyPage, { PRIVACY_SECTIONS } from "@/app/(public)/privacy/page";
import SmsTermsPage, { SMS_TERMS_SECTIONS } from "@/app/(public)/sms-terms/page";
import TermsPage, { TERMS_SECTIONS } from "@/app/(public)/terms/page";
import { LegalHeading, LegalPage, legalSectionId } from "@/components/layout/LegalPage";
import { LEGAL_EFFECTIVE_DATE, SMS_CONSENT_TEXT } from "@/lib/constants";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
/** The CARRIER_DISABLED flag as the pages see it; off unless a test turns it on. */
const availability = vi.hoisted(() => ({ carrierDisabled: false }));

vi.mock("next/navigation", () => ({ usePathname: () => "/", redirect: navigation.redirect }));
vi.mock("@/server/actions/marketing.actions", () => ({
  checkServiceAreaAction: vi.fn(),
  sendContactMessageAction: vi.fn(),
}));
vi.mock("@/lib/carrier/availability", () => ({
  CARRIER_COMING_SOON_PATH: "/carriers",
  isCarrierDisabled: () => availability.carrierDisabled,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  availability.carrierDisabled = false;
  navigation.redirect.mockClear();
});

/** Words a finished public page must never show (Twilio reads the site as a real business). */
const PLACEHOLDER_WORDS = /placeholder|coming soon|to be provided|lorem ipsum|pending legal|TODO|TBD/i;

describe("landing page", () => {
  it("has a headline and one sentence each for carriers and drivers", () => {
    render(<LandingPage />);
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Local freight shifts, filled fast",
    );
    expect(within(main).getByText(/find certified transport operators/)).toBeInTheDocument();
    expect(within(main).getByText(/get matching shift offers by text/)).toBeInTheDocument();
  });

  it("says where FleetGrid is launching", () => {
    render(<LandingPage />);
    const line = within(screen.getByRole("main")).getByText("Now launching in the Houston area.");
    expect(line).toHaveAttribute("data-slot", "launch-line");
  });

  it("both buttons go to login with the role preselected", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "I'm a Driver" })).toHaveAttribute(
      "href",
      "/login?role=driver",
    );
    expect(screen.getByRole("link", { name: "I'm a Carrier" })).toHaveAttribute(
      "href",
      "/login?role=carrier",
    );
  });

  it("the buttons are large tap targets", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "I'm a Driver" })).toHaveClass("h-target-lg");
    expect(screen.getByRole("link", { name: "I'm a Carrier" })).toHaveClass("h-target-lg");
  });

  it("with CARRIER_DISABLED the carrier button keeps its label and goes to the coming soon page", () => {
    availability.carrierDisabled = true;
    render(<LandingPage />);
    const button = screen.getByRole("link", { name: "I'm a Carrier" });
    expect(button).toHaveAttribute("href", "/carriers");
    expect(button).toHaveClass("h-target-lg");
    expect(document.body.textContent).not.toMatch(/coming soon/i);
    // The driver side is untouched.
    expect(screen.getByRole("link", { name: "I'm a Driver" })).toHaveAttribute(
      "href",
      "/login?role=driver",
    );
  });
});

describe("/carriers with CARRIER_DISABLED", () => {
  it("says carriers are coming soon and offers the support email, instead of the marketing page", () => {
    availability.carrierDisabled = true;
    render(<CarriersPage />);
    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Carriers: coming soon",
    );
    expect(main).toHaveTextContent(/Carrier sign-up is not open yet/);
    expect(within(main).getByRole("link", { name: /support@fleetgridus.com/ })).toHaveAttribute(
      "href",
      "mailto:support@fleetgridus.com",
    );
    expect(within(main).getByRole("link", { name: "Back to the home page" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(main).not.toHaveTextContent(/\$399/);
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("with the carrier side open it is the marketing page, with no redirect", () => {
    render(<CarriersPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Fill open shifts with local drivers who already said yes to texts.",
    );
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("says under the driver button that drivers can opt in to texts, with the SMS Terms link", () => {
    render(<LandingPage />);
    const line = document.querySelector("[data-slot=sms-opt-in-line]") as HTMLElement;
    expect(line).toHaveTextContent(
      "Drivers can opt in to receive shift offers by text. See SMS Terms.",
    );
    expect(within(line).getByRole("link", { name: "SMS Terms" })).toHaveAttribute(
      "href",
      "/sms-terms",
    );
    // Directly under the driver button: the two share a column.
    expect(line.parentElement).toContainElement(screen.getByRole("link", { name: "I'm a Driver" }));
  });

  it("explains how it works for carriers and for drivers, in two columns", () => {
    render(<LandingPage />);
    const section = screen.getByRole("region", { name: "How it works" });
    const carriers = within(section).getByRole("heading", { level: 3, name: "Carriers" });
    const drivers = within(section).getByRole("heading", { level: 3, name: "Drivers" });
    const steps = (heading: HTMLElement) =>
      within(heading.parentElement as HTMLElement)
        .getAllByRole("listitem")
        .map((item) => item.textContent);
    expect(steps(carriers)).toEqual([
      "Subscribe to FleetGrid.",
      "Search qualified drivers near your yard.",
      "Broadcast a shift. The first driver to reply YES has it.",
    ]);
    expect(steps(drivers)).toEqual([
      "Sign up on your phone with a text code.",
      "Build your qualification card in six short pages.",
      "Get shift offers by text and reply YES to claim one.",
    ]);
  });

  it("says who FleetGrid LLC is, where it launches and who it serves", () => {
    render(<LandingPage />);
    const about = screen.getByRole("region", { name: "About FleetGrid" });
    expect(about).toHaveTextContent(/FleetGrid LLC runs a confidential directory/);
    expect(about).toHaveTextContent(/launching in the Houston, Texas area first/);
    expect(about).toHaveTextContent(/serves carriers .* and drivers/);
  });

  it("has a Contact section with the email and the business address, and no phone number", () => {
    render(<LandingPage />);
    const contact = screen.getByRole("region", { name: "Contact" });
    expect(within(contact).getByRole("link", { name: "support@fleetgridus.com" })).toHaveAttribute(
      "href",
      "mailto:support@fleetgridus.com",
    );
    expect(contact.querySelector("a[href^='tel:']")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\(\d{3}\) \d{3}-\d{4}/);
    expect(contact).toHaveTextContent("FleetGrid LLC8401 Mayland Dr. STE ARichmond, VA 23294");
  });

  it("shows a phone number only when SUPPORT_PHONE is set", () => {
    vi.stubEnv("SUPPORT_PHONE", "+12145550123");
    render(<LandingPage />);
    const contact = screen.getByRole("region", { name: "Contact" });
    expect(within(contact).getByRole("link", { name: "(214) 555-0123" })).toHaveAttribute(
      "href",
      "tel:+12145550123",
    );
  });

  it("the footer names FleetGrid LLC with the support email, the address and the legal links", () => {
    render(<LandingPage />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(`© ${new Date().getFullYear()} FleetGrid LLC`);
    const contact = footer.querySelector("[data-slot=footer-contact]") as HTMLElement;
    expect(within(contact).getByRole("link", { name: "support@fleetgridus.com" })).toHaveAttribute(
      "href",
      "mailto:support@fleetgridus.com",
    );
    expect(contact).toHaveTextContent("8401 Mayland Dr. STE A, Richmond, VA 23294");
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(
      within(legal)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/terms", "/privacy", "/sms-terms"]);
  });

  it("takes the contact details from the environment when they are set there", () => {
    vi.stubEnv("SUPPORT_EMAIL", "hello@fleetgridus.com");
    vi.stubEnv("BUSINESS_ADDRESS", "1 Main St | Houston, TX 77002");
    render(<LandingPage />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "hello@fleetgridus.com" })).toBeInTheDocument();
    expect(footer).toHaveTextContent("1 Main St, Houston, TX 77002");
  });
});

describe("LegalPage", () => {
  it("shows the eyebrow, the title, the date when given, and the body in the site shell", () => {
    const { rerender } = render(
      <LegalPage title="Terms" effective="October 10, 2026">
        <p>Body</p>
      </LegalPage>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Terms" })).toBeInTheDocument();
    const header = document.querySelector("[data-slot=legal-header]") as HTMLElement;
    expect(header).toHaveClass("bg-sign-panel", "border-sign-panel-border");
    expect(within(header).getByText("Legal")).toHaveClass("uppercase");
    expect(screen.getByText("Last updated October 10, 2026")).toHaveAttribute(
      "data-slot",
      "effective",
    );
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveAttribute("data-slot", "site-header");
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();

    rerender(<LegalPage title="SMS Terms" />);
    expect(document.querySelector("[data-slot=effective]")).toBeNull();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("builds the table of contents from the sections, pointing at each heading's anchor", () => {
    render(
      <LegalPage title="Terms" sections={["1. What is FleetGrid?", "2. Accounts"]}>
        <LegalHeading>1. What is FleetGrid?</LegalHeading>
        <p>One</p>
        <LegalHeading>2. Accounts</LegalHeading>
        <p>Two</p>
      </LegalPage>,
    );
    const toc = screen.getByRole("navigation", { name: "On this page" });
    expect(toc).toHaveAttribute("data-slot", "legal-toc");
    expect(toc).toHaveClass("lg:sticky");
    const links = within(toc).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#what-is-fleetgrid",
      "#accounts",
    ]);
    for (const link of links) expect(link).toHaveClass("min-h-target");
    expect(screen.getByRole("heading", { level: 2, name: "1. What is FleetGrid?" })).toHaveAttribute(
      "id",
      "what-is-fleetgrid",
    );
    expect(screen.getByRole("heading", { level: 2, name: "2. Accounts" })).toHaveAttribute(
      "id",
      "accounts",
    );
  });

  it("turns a heading into an anchor id", () => {
    expect(legalSectionId("13. Governing law and dispute resolution")).toBe(
      "governing-law-and-dispute-resolution",
    );
    expect(legalSectionId("Msg & data rates")).toBe("msg-data-rates");
    expect(legalSectionId("Program name")).toBe("program-name");
  });
});

describe.each([
  ["/terms", TermsPage, TERMS_SECTIONS],
  ["/privacy", PrivacyPage, PRIVACY_SECTIONS],
  ["/sms-terms", SmsTermsPage, SMS_TERMS_SECTIONS],
])("%s table of contents", (_path, Page, sections) => {
  it("lists every heading of the page, in order, and nothing else", () => {
    render(<Page />);
    const headings = within(screen.getByRole("main"))
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([...sections]);
    const toc = screen.getByRole("navigation", { name: "On this page" });
    expect(within(toc).getAllByRole("link").map((link) => link.textContent)).toEqual([
      ...sections,
    ]);
    for (const heading of within(screen.getByRole("main")).getAllByRole("heading", { level: 2 })) {
      expect(heading).toHaveAttribute("id");
      expect(within(toc).getByRole("link", { name: heading.textContent! })).toHaveAttribute(
        "href",
        `#${heading.id}`,
      );
    }
  });
});

describe.each([
  ["/", LandingPage, "Local freight shifts, filled fast"],
  ["/terms", TermsPage, "Terms of Service"],
  ["/privacy", PrivacyPage, "Privacy Policy"],
  ["/sms-terms", SmsTermsPage, "SMS Terms"],
])("%s", (_path, Page, title) => {
  it("is finished: real text, no placeholder words, no banner", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(PLACEHOLDER_WORDS);
  });
});

describe.each([
  ["/terms", TermsPage, "Terms of Service"],
  ["/privacy", PrivacyPage, "Privacy Policy"],
])("%s", (_path, Page, title) => {
  it("carries the effective date, names the company and gives the contact details", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText(`Last updated ${LEGAL_EFFECTIVE_DATE}`)).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main).toHaveTextContent(/FleetGrid LLC/);
    expect(within(main).getByRole("heading", { name: /Contact/ })).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: "support@fleetgridus.com" })).toHaveAttribute(
      "href",
      "mailto:support@fleetgridus.com",
    );
    expect(main).toHaveTextContent("8401 Mayland Dr. STE A");
    expect(main).toHaveTextContent("Richmond, VA 23294");
    expect(main.querySelector("a[href^='tel:']")).toBeNull();
  });
});

describe("/terms", () => {
  it("says what FleetGrid is and is not, and covers accounts, texts, deletion and liability", () => {
    render(<TermsPage />);
    const main = screen.getByRole("main");
    for (const heading of [
      "1. What is FleetGrid?",
      "2. Accounts",
      "3. Drivers",
      "4. Carriers",
      "5. Text messages",
      "6. Acceptable use",
      "7. Review, suspension and removal",
      "8. Deleting your account",
      "10. Disclaimers",
      "11. Limitation of liability",
      "13. Governing law and dispute resolution",
    ]) {
      expect(within(main).getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(main).toHaveTextContent(/not an employer, a staffing agency, a freight broker/);
    expect(main).toHaveTextContent(/Reply STOP to stop and HELP for help/);
    // The client's wording of 2026-10-12.
    for (const text of [
      "You must be 18 years old or older",
      "by checking the consent box",
      "We will notify you when we become aware.",
      "sign-in are removed permanently",
      "Carriers maintain sole responsibility for evaluating, qualifying and managing all drivers. FleetGrid provides directory matching only.",
      "verifying the driver's CDL, DOT medical card, TWIC, MVR record and FMCSA Clearinghouse status",
      "creating and maintaining all FMCSA-required Driver Qualification (DQ) files",
      "supplying appropriate commercial insurance",
      "setting pay rates, managing tax classifications (W-2 or 1099) and paying drivers directly",
      "You are fully responsible for your shifts, equipment, operations and the personnel you engage.",
      // Section 3, Drivers, her sentence of 2026-10-13.
      "FleetGrid does not pay wages, withhold taxes, manage schedules, or issue tax forms (W-2/1099) to drivers. All work, payment, and engagement terms are strictly between you and the carrier.",
      // Section 13, her expanded version of 2026-10-13: AAA arbitration, no class actions.
      "final and binding individual arbitration administered by the American Arbitration Association (AAA) under its Commercial Rules",
      "either party may bring claims in small claims court in Virginia if qualified",
      "not in a class, consolidated, or representative action",
      "the prevailing party shall be entitled to recover its reasonable attorneys’ fees and costs",
      "brought exclusively in the state or federal courts located in Virginia",
    ]) {
      expect(main, text).toHaveTextContent(text);
    }
    expect(main).not.toHaveTextContent(/for good|ticking/);
    expect(within(main).getByRole("link", { name: "SMS Terms" })).toHaveAttribute(
      "href",
      "/sms-terms",
    );
  });
});

describe("/privacy", () => {
  it("lists what is collected, who sees it, the consent record and the choices", () => {
    render(<PrivacyPage />);
    const main = screen.getByRole("main");
    for (const heading of [
      "1. What we collect",
      "2. How we use it",
      "3. Who can see your information",
      "4. Text messages",
      "5. How long we keep it",
      "6. Security",
      "7. Your choices",
      "9. Data sources",
    ]) {
      expect(within(main).getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(main).toHaveTextContent(/phone number is never shown to carriers/);
    expect(main).toHaveTextContent(/do not sell your personal information/);
    // Twilio's verbatim clause (2026-10-14), in section 3.
    expect(main.querySelector("[data-slot=opt-in-data-clause]")).toHaveTextContent(
      "All the above categories exclude text messaging originator opt-in data and consent; this information won't be shared with any third parties.",
    );
    expect(main).toHaveTextContent(/by checking a box during sign-up/);
    expect(main).not.toHaveTextContent(/ticking/);
    expect(main).toHaveTextContent(
      /record of text-message consent and opt-outs, including the phone number and time/,
    );
    expect(main).toHaveTextContent(/Supabase .* Vercel .* Twilio .* Stripe/);
    expect(within(main).getByRole("link", { name: "GeoNames" })).toHaveAttribute(
      "href",
      "https://www.geonames.org/",
    );
  });

  it("styles the Data sources paragraph like every other paragraph (client note of 2026-10-12)", () => {
    render(<PrivacyPage />);
    const main = screen.getByRole("main");
    const firstHeading = within(main).getByRole("heading", { name: "1. What we collect" });
    // Every body paragraph, from the first section on (the "Effective" line above is the header).
    const paragraphs = [...main.querySelectorAll("p")].filter(
      (paragraph) =>
        firstHeading.compareDocumentPosition(paragraph) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const dataSources = within(main).getByRole("link", { name: "GeoNames" }).closest("p");
    expect(dataSources).not.toBeNull();
    expect(paragraphs).toContain(dataSources);
    // No body paragraph carries its own size, line height or colour; the page sets them once.
    for (const paragraph of paragraphs) {
      expect(paragraph.className, paragraph.textContent ?? "").not.toMatch(
        /text-small|leading-small|text-muted-foreground/,
      );
    }
  });
});

describe("/sms-terms", () => {
  it("names the program and the company", () => {
    render(<SmsTermsPage />);
    expect(screen.getByRole("heading", { name: "Program name" })).toBeInTheDocument();
    expect(screen.getByText("FleetGrid Shift Alerts, sent by FleetGrid LLC.")).toBeInTheDocument();
  });

  it("covers everything carriers require for toll-free verification and A2P 10DLC", () => {
    render(<SmsTermsPage />);
    const main = screen.getByRole("main");
    // What is sent
    expect(within(main).getByText(/available work shifts/)).toBeInTheDocument();
    // Frequency
    expect(within(main).getByRole("heading", { name: "Message frequency" })).toBeInTheDocument();
    expect(within(main).getByText(/^Message frequency varies\. It depends/)).toBeInTheDocument();
    // Cost, in the exact wording carriers look for
    expect(within(main).getByText(/Msg & data rates may apply/)).toBeInTheDocument();
    // STOP and HELP
    expect(within(main).getByText("STOP")).toBeInTheDocument();
    expect(within(main).getByText("HELP")).toBeInTheDocument();
    expect(within(main).getByText("START")).toBeInTheDocument();
    // Support contact: the email; no phone number unless one is configured
    const contact = main.querySelector("[data-slot=support-contact]") as HTMLElement;
    expect(within(contact).getByRole("link", { name: "support@fleetgridus.com" })).toHaveAttribute(
      "href",
      "mailto:support@fleetgridus.com",
    );
    expect(contact.querySelector("a[href^='tel:']")).toBeNull();
    // No sharing for marketing
    expect(within(main).getByText(/do not sell your phone number/)).toBeInTheDocument();
    // The carrier liability line, in Twilio's standard wording (2026-10-14)
    expect(
      within(main).getByText("Wireless carriers are not liable for delayed or undelivered messages."),
    ).toBeInTheDocument();
    expect(main).not.toHaveTextContent(/Mobile carriers/);
    // Links to both other legal pages
    expect(within(main).getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(within(main).getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "/terms",
    );
    // How you opt in, in the client's words (2026-10-12)
    expect(main).toHaveTextContent(
      "Drivers opt in during sign-up by checking an unchecked box next to this statement:",
    );
    expect(main).not.toHaveTextContent(/ticking/);
  });

  it("shows a configured support phone and email instead", () => {
    vi.stubEnv("SUPPORT_EMAIL", "help@fleetgridus.com");
    vi.stubEnv("SUPPORT_PHONE", "+12145550123");
    render(<SmsTermsPage />);
    const main = screen.getByRole("main");
    expect(within(main).getByRole("link", { name: "(214) 555-0123" })).toHaveAttribute(
      "href",
      "tel:+12145550123",
    );
    expect(within(main).getByRole("link", { name: "help@fleetgridus.com" })).toHaveAttribute(
      "href",
      "mailto:help@fleetgridus.com",
    );
  });

  it("quotes the exact consent text drivers agree to", () => {
    render(<SmsTermsPage />);
    expect(screen.getByText(SMS_CONSENT_TEXT)).toBeInTheDocument();
  });

  it("links to the privacy policy and terms", () => {
    render(<SmsTermsPage />);
    const main = screen.getByRole("main");
    expect(within(main).getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(within(main).getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });
});
