import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DriversPage from "@/app/(public)/drivers/page";
import FaqPage from "@/app/(public)/faq/page";
import { Faq } from "@/components/marketing/Faq";
import { DRIVER_FAQ_EXCERPT, FAQ_GROUPS } from "@/content/faq";
import { DRIVERS } from "@/content/marketing";
import { SMS_SAMPLE_OFFER } from "@/content/sms-samples";

vi.mock("next/navigation", () => ({ usePathname: () => "/drivers" }));

const ALL_ENTRIES = FAQ_GROUPS.flatMap((group) => group.entries);

describe("/drivers", () => {
  it("has one H1, the free sign-up button and the no-app line", () => {
    render(<DriversPage />);
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent(DRIVERS.hero.title);
    const hero = screen.getByRole("region", { name: DRIVERS.hero.title });
    expect(within(hero).getByRole("link", { name: "Sign up free" })).toHaveAttribute("href", "/login?role=driver");
    expect(hero).toHaveTextContent("No app. No password. We text you a code to log in.");
  });

  it("shows the three sign-up steps and the real lane bar on the Driving mile", () => {
    render(<DriversPage />);
    const steps = screen.getByRole("list", { name: "Sign-up steps" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(steps).toHaveTextContent("Your name, ZIP and CDL class first, then one mile at a time: Driving, Clearinghouse and SAP (optional), Cards, Letters, Equipment, Finish.");
    const frame = document.querySelector("[data-slot=device-frame]") as HTMLElement;
    expect(within(frame).getByRole("progressbar", { name: "Progress" })).toHaveAttribute(
      "aria-valuetext",
      "Step 2 of 7: Driving",
    );
    expect(frame).toHaveTextContent("Mile 2 of 7");
    expect(frame.querySelector("figcaption")).toHaveTextContent("Mile 2 of 7, Driving.");
    expect(frame).toHaveTextContent("How many years have you driven with a CDL?");
  });

  it("lists the eleven card answers in the sign-up's order, then the optional text box", () => {
    render(<DriversPage />);
    const list = screen.getByRole("list", { name: "The driver card" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent?.replace(/^\d+/, ""))).toEqual(
      DRIVERS.card.items,
    );
    expect(DRIVERS.card.items).toHaveLength(11);
    expect(screen.getByText(/Then one box, your choice/)).toBeInTheDocument();
    // Nothing the sign-up does not ask.
    expect(list).not.toHaveTextContent(/work type|availability|certification|bio|upload/i);
  });

  it("explains shift texts with the Twilio sample and the STOP line, and why it is free", () => {
    render(<DriversPage />);
    expect(screen.getByRole("group", { name: /sample text thread/ })).toHaveTextContent(SMS_SAMPLE_OFFER);
    expect(screen.getByText("Reply STOP at any time to stop texts. Reply HELP for help.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Carriers pay. You never do." })).toBeInTheDocument();
  });

  it("keeps the four respect lines, the outside-Houston note, the FAQ links and the CTA band", () => {
    render(<DriversPage />);
    const respect = screen.getByRole("region", { name: "Your card, your call" });
    expect(within(respect).getAllByRole("listitem").map((item) => item.textContent)).toEqual(DRIVERS.respect.items);
    // The client's sentence of 2026-10-25, replacing "never shown to carriers".
    expect(respect).toHaveTextContent(
      "Your phone number is shared only with the carrier whose shift you book, when you reply YES.",
    );
    expect(respect).not.toHaveTextContent(/never shown to carriers/);
    expect(screen.getByRole("region", { name: "Outside the Houston area?" })).toHaveTextContent(
      "If you opted in to texts, we will text you",
    );
    for (const entry of DRIVER_FAQ_EXCERPT) {
      expect(screen.getByRole("link", { name: entry.question })).toHaveAttribute("href", `/faq#${entry.id}`);
    }
    const band = screen.getByRole("region", { name: "Ready when you are." });
    expect(within(band).getByRole("link", { name: "Sign up free" })).toHaveAttribute("href", "/login?role=driver");
  });

  it("never shows a phone number, a placeholder word or a dash", () => {
    render(<DriversPage />);
    const text = screen.getByRole("main").textContent ?? "";
    expect(text).not.toMatch(/869-2040|coming soon|placeholder|TODO|TBD|lorem/i);
    expect(text).not.toMatch(/[–—!]/);
  });
});

describe("/faq", () => {
  it("has one H1, the three groups, and every answer in the HTML", () => {
    render(<FaqPage />);
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const group of FAQ_GROUPS) {
      expect(within(main).getByRole("region", { name: group.title })).toHaveAttribute("id", group.id);
      expect(within(screen.getByRole("navigation", { name: "Groups" })).getByRole("link", { name: group.title })).toHaveAttribute(
        "href",
        `#${group.id}`,
      );
    }
    for (const entry of ALL_ENTRIES) {
      expect(main).toHaveTextContent(entry.answer);
      expect(document.getElementById(entry.id)).not.toBeNull();
    }
    expect(within(main).getByRole("link", { name: "Contact FleetGrid" })).toHaveAttribute("href", "/contact");
  });

  it("the consent answer says No, and no answer promises a turnaround", () => {
    const required = ALL_ENTRIES.find((entry) => entry.id === "texts-required")!;
    expect(required.answer.startsWith("No.")).toBe(true);
    for (const entry of ALL_ENTRIES) {
      expect(entry.answer, entry.id).not.toMatch(/business day|within \d+ (hours|days)/i);
    }
  });

  it("rows are 56px buttons that open and close, with the closed answers hidden but present", async () => {
    render(<Faq groups={FAQ_GROUPS} />);
    const first = FAQ_GROUPS[0].entries[0];
    const button = screen.getByRole("button", { name: first.question });
    expect(button).toHaveClass("min-h-target-lg");
    expect(button).toHaveAttribute("aria-expanded", "false");
    const answer = screen.getByText(first.answer);
    expect(answer.closest("[data-state]")).toHaveAttribute("data-state", "closed");
    expect(answer.closest("[hidden]")).not.toBeNull();

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(answer.closest("[hidden]")).toBeNull();
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("a link with a hash opens that answer", () => {
    window.location.hash = "#driver-free";
    render(<Faq groups={FAQ_GROUPS} />);
    expect(screen.getByRole("button", { name: "Is FleetGrid really free for drivers?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    window.location.hash = "";
  });
});
