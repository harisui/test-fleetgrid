import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthShell } from "@/components/auth/AuthShell";
import { HelpSheet } from "@/components/onboarding/HelpSheet";
import { MILE_SUMMARIES, MILES } from "@/lib/onboarding/steps";

function stubDesktop(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const helpButton = () => screen.getByRole("button", { name: "Help" });

/** The words are the same whichever surface shows them. */
function expectHelpContent(surface: HTMLElement) {
  expect(within(surface).getByRole("heading", { name: "How to sign in" })).toBeInTheDocument();
  expect(within(surface).getByText(/we text you a 6-digit code/)).toBeInTheDocument();
  expect(within(surface).getByRole("heading", { name: "Need a new code?" })).toBeInTheDocument();
  expect(within(surface).getByText(/tap Resend code/)).toBeInTheDocument();
  expect(
    within(surface).getByRole("heading", { name: "What the stages mean" }),
  ).toBeInTheDocument();
  const stages = within(within(surface).getByRole("list", { name: "Stages" })).getAllByRole(
    "listitem",
  );
  expect(stages.map((item) => item.textContent)).toEqual(
    MILES.map((mile) => `${mile.label}${MILE_SUMMARIES[mile.mile]}`),
  );
  expect(within(surface).getByRole("heading", { name: "Support" })).toBeInTheDocument();
  expect(within(surface).getByRole("link", { name: "SMS Terms" })).toHaveAttribute(
    "href",
    "/sms-terms",
  );
  expect(within(surface).getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
    "href",
    "/privacy",
  );
}

describe("HelpSheet on a phone", () => {
  it("opens a bottom sheet with the sign-in help, the stage guide and the support block", async () => {
    stubDesktop(false);
    render(<HelpSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(helpButton());
    const sheet = await screen.findByRole("dialog", { name: "Help" });
    expect(sheet).toHaveAttribute("data-slot", "help-sheet");
    expect(sheet).toHaveClass("fixed", "bottom-0", "inset-x-0", "rounded-t-sheet");
    expect(sheet.className).toContain("safe-area-inset-bottom");
    expect(sheet.className).not.toMatch(/scale|bounce|spring/);
    expectHelpContent(sheet);
  });

  it("closes with the Close button and with Escape, and focus returns to Help", async () => {
    stubDesktop(false);
    render(<HelpSheet />);

    await userEvent.click(helpButton());
    const sheet = await screen.findByRole("dialog", { name: "Help" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(helpButton()).toHaveFocus();

    await userEvent.click(helpButton());
    await screen.findByRole("dialog", { name: "Help" });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(helpButton()).toHaveFocus();
  });

  it("opens from the keyboard alone", async () => {
    stubDesktop(false);
    render(<HelpSheet />);
    await userEvent.tab();
    expect(helpButton()).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Help" })).toBeInTheDocument();
  });
});

describe("HelpSheet on a wide screen", () => {
  it("opens a popover under the button with the same words, and no overlay", async () => {
    stubDesktop(true);
    render(<HelpSheet />);
    await userEvent.click(helpButton());
    const popover = await screen.findByRole("dialog", { name: "Help" });
    expect(popover).toHaveAttribute("data-slot", "help-popover");
    expect(popover).toHaveClass("rounded-card", "border-2", "border-border-strong");
    expect(document.querySelector("[data-slot=sheet-overlay]")).toBeNull();
    expectHelpContent(popover);
    expect(helpButton()).toHaveAttribute("aria-expanded", "true");
  });

  it("closes with Escape and gives focus back to Help", async () => {
    stubDesktop(true);
    render(<HelpSheet />);
    await userEvent.click(helpButton());
    await screen.findByRole("dialog", { name: "Help" });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(helpButton()).toHaveFocus();
  });
});

describe("the support block", () => {
  it("says the contact is coming soon when none is configured", async () => {
    stubDesktop(false);
    render(<HelpSheet support={{}} />);
    await userEvent.click(helpButton());
    const sheet = await screen.findByRole("dialog", { name: "Help" });
    expect(within(sheet).getByText("Support contact coming soon.")).toHaveAttribute(
      "data-slot",
      "support-contact",
    );
    expect(within(sheet).queryByRole("link", { name: /^Call|^Email/ })).not.toBeInTheDocument();
  });

  it("shows a phone and an email as tappable links when they are configured", async () => {
    stubDesktop(false);
    render(<HelpSheet support={{ email: "help@fleetgridus.com", phone: "+12145550123" }} />);
    await userEvent.click(helpButton());
    const sheet = await screen.findByRole("dialog", { name: "Help" });
    expect(within(sheet).queryByText("Support contact coming soon.")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "(214) 555-0123" })).toHaveAttribute(
      "href",
      "tel:+12145550123",
    );
    expect(within(sheet).getByRole("link", { name: "help@fleetgridus.com" })).toHaveAttribute(
      "href",
      "mailto:help@fleetgridus.com",
    );
  });

  it("shows only the part that is configured", async () => {
    stubDesktop(true);
    render(<HelpSheet support={{ phone: "+12145550123" }} />);
    await userEvent.click(helpButton());
    const popover = await screen.findByRole("dialog", { name: "Help" });
    expect(within(popover).getByRole("link", { name: "(214) 555-0123" })).toBeInTheDocument();
    expect(within(popover).queryByText(/^Email/)).not.toBeInTheDocument();
  });
});

describe("AuthShell", () => {
  it("has the Help sheet in its header and passes the support contact through", async () => {
    stubDesktop(false);
    render(
      <AuthShell support={{ email: "help@example.com" }}>
        <p>Form</p>
      </AuthShell>,
    );
    await userEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Help" }));
    const sheet = await screen.findByRole("dialog", { name: "Help" });
    expect(within(sheet).getByRole("link", { name: "help@example.com" })).toBeInTheDocument();
  });
});
