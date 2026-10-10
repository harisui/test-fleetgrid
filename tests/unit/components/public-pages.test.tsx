import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingPage from "@/app/(public)/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import SmsTermsPage from "@/app/(public)/sms-terms/page";
import TermsPage from "@/app/(public)/terms/page";
import { LegalPage } from "@/components/layout/LegalPage";
import { LEGAL_EFFECTIVE_DATE, SMS_CONSENT_TEXT } from "@/lib/constants";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("has a Contact section with the email, the number and the business address", () => {
    render(<LandingPage />);
    const contact = screen.getByRole("region", { name: "Contact" });
    expect(within(contact).getByRole("link", { name: "support@fleetgridus.com" })).toHaveAttribute(
      "href",
      "mailto:support@fleetgridus.com",
    );
    expect(within(contact).getByRole("link", { name: "(888) 869-2040" })).toHaveAttribute(
      "href",
      "tel:+18888692040",
    );
    expect(contact).toHaveTextContent("FleetGrid LLC8401 Mayland Dr. STE ARichmond, VA 23294");
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
  it("shows the title, the effective date when given, and the body", () => {
    const { rerender } = render(
      <LegalPage title="Terms" effective="October 10, 2026">
        <p>Body</p>
      </LegalPage>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Terms" })).toBeInTheDocument();
    expect(screen.getByText("Effective October 10, 2026")).toHaveAttribute("data-slot", "effective");
    expect(screen.getByText("Body")).toBeInTheDocument();

    rerender(<LegalPage title="SMS Terms" />);
    expect(document.querySelector("[data-slot=effective]")).toBeNull();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
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
    expect(screen.getByText(`Effective ${LEGAL_EFFECTIVE_DATE}`)).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main).toHaveTextContent(/FleetGrid LLC/);
    expect(within(main).getByRole("heading", { name: /Contact/ })).toBeInTheDocument();
    expect(within(main).getByRole("link", { name: "support@fleetgridus.com" })).toHaveAttribute(
      "href",
      "mailto:support@fleetgridus.com",
    );
    expect(main).toHaveTextContent("8401 Mayland Dr. STE A");
    expect(main).toHaveTextContent("Richmond, VA 23294");
  });
});

describe("/terms", () => {
  it("says what FleetGrid is and is not, and covers accounts, texts, deletion and liability", () => {
    render(<TermsPage />);
    const main = screen.getByRole("main");
    for (const heading of [
      "1. What FleetGrid is",
      "2. Accounts",
      "3. Drivers",
      "4. Carriers",
      "5. Text messages",
      "6. Acceptable use",
      "7. Review, suspension and removal",
      "8. Deleting your account",
      "10. Disclaimers",
      "11. Limitation of liability",
      "13. Governing law",
    ]) {
      expect(within(main).getByRole("heading", { name: heading })).toBeInTheDocument();
    }
    expect(main).toHaveTextContent(/not an employer, a staffing agency, a freight broker/);
    expect(main).toHaveTextContent(/Reply STOP to stop and HELP for help/);
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
    expect(main).toHaveTextContent(
      /record of text-message consent and opt-outs, including the phone number and time/,
    );
    expect(main).toHaveTextContent(/Supabase .* Vercel .* Twilio .* Stripe/);
    expect(within(main).getByRole("link", { name: "GeoNames" })).toHaveAttribute(
      "href",
      "https://www.geonames.org/",
    );
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
    // Support contact
    const contact = main.querySelector("[data-slot=support-contact]") as HTMLElement;
    expect(within(contact).getByRole("link", { name: "support@fleetgridus.com" })).toHaveAttribute(
      "href",
      "mailto:support@fleetgridus.com",
    );
    expect(within(contact).getByRole("link", { name: "(888) 869-2040" })).toHaveAttribute(
      "href",
      "tel:+18888692040",
    );
    // No sharing for marketing
    expect(within(main).getByText(/do not sell your phone number/)).toBeInTheDocument();
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
