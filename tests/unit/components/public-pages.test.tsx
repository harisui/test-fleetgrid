import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "@/app/(public)/page";
import PrivacyPage from "@/app/(public)/privacy/page";
import SmsTermsPage from "@/app/(public)/sms-terms/page";
import TermsPage from "@/app/(public)/terms/page";
import { LegalPage } from "@/components/layout/LegalPage";
import { SMS_CONSENT_TEXT } from "@/lib/constants";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const BANNER = "Legal text to be provided by FleetGrid.";

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
    expect(screen.getByRole("link", { name: "I'm a Driver" })).toHaveClass("h-12");
    expect(screen.getByRole("link", { name: "I'm a Carrier" })).toHaveClass("h-12");
  });

  it("links to the legal pages from the footer", () => {
    render(<LandingPage />);
    const legal = screen.getByRole("navigation", { name: "Legal" });
    expect(
      within(legal)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/terms", "/privacy", "/sms-terms"]);
  });
});

describe("LegalPage", () => {
  it("shows the banner only for placeholder pages", () => {
    const { rerender } = render(
      <LegalPage title="Terms" placeholder>
        <p>Body</p>
      </LegalPage>,
    );
    expect(screen.getByRole("note")).toHaveTextContent(BANNER);
    expect(screen.getByRole("heading", { level: 1, name: "Terms" })).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();

    rerender(<LegalPage title="SMS Terms" />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe.each([
  ["terms", TermsPage, "Terms of Service"],
  ["privacy", PrivacyPage, "Privacy Policy"],
])("/%s", (_path, Page, title) => {
  it("is a placeholder with a clear banner", () => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(BANNER);
  });
});

describe("/sms-terms", () => {
  it("has no placeholder banner", () => {
    render(<SmsTermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "SMS Terms" })).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("names the program", () => {
    render(<SmsTermsPage />);
    expect(screen.getByRole("heading", { name: "Program name" })).toBeInTheDocument();
    expect(screen.getByText("FleetGrid Shift Alerts")).toBeInTheDocument();
  });

  it("covers everything carriers require for A2P 10DLC", () => {
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
    // Support contact (placeholder until the client supplies it)
    expect(
      within(main).getByText(/support contact to be provided by FleetGrid/),
    ).toBeInTheDocument();
    // No sharing for marketing
    expect(within(main).getByText(/do not sell your phone number/)).toBeInTheDocument();
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
