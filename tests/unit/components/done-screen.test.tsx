import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DoneScreen } from "@/components/driver/DoneScreen";
import { buildDriver } from "../../setup/factories";

vi.mock("@/server/actions/auth.actions", () => ({ signOutAction: vi.fn() }));

const nextSteps = () =>
  within(screen.getByRole("list", { name: "What happens next" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);
const doneText = () => document.querySelector("[data-slot=done-text]");
const doneScreen = () => document.querySelector("[data-slot=done-screen]");

/** The client's words of 2026-10-25, with the SMS line for drivers who said yes to texts. */
const REVIEW_TEXT =
  "Your profile is being reviewed for the Houston FleetGrid Network. Once approved, carriers can find you daily.";
const SMS_LINE = "Keep an eye out for SMS shift alerts on your phone.";

describe("DoneScreen", () => {
  it("tells a driver inside the launch area, with texts on, they are in, with the SMS line", () => {
    render(<DoneScreen driver={buildDriver({ inServiceArea: true })} onEdit={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You're in!");
    expect(doneText()).toHaveTextContent(`${REVIEW_TEXT} ${SMS_LINE}`);
    expect(nextSteps()).toEqual([
      "Shift offers arrive by text. Reply YES to claim one.",
      "You can add your CDL and medical card any time from Documents.",
    ]);
    expect(doneScreen()).toHaveAttribute("data-area", "inside");
    expect(doneScreen()).toHaveAttribute("data-texts", "on");
    expect(screen.queryByText(/isn't in your area/)).not.toBeInTheDocument();
    // Nothing promises an immediate listing: the profile is reviewed first.
    expect(document.body.textContent).not.toMatch(/now active|can now find you/);
  });

  it.each([
    ["declined texts", { smsOptIn: false }],
    ["replied STOP", { smsOptedOut: true }],
  ] as const)("leaves the SMS line and the text step out for a driver who %s", (_label, texts) => {
    render(<DoneScreen driver={buildDriver({ inServiceArea: true, ...texts })} onEdit={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You're in!");
    expect(doneText()).toHaveTextContent(REVIEW_TEXT);
    expect(doneText()).not.toHaveTextContent(SMS_LINE);
    expect(nextSteps()).toEqual([
      "You can add your CDL and medical card any time from Documents.",
    ]);
    expect(doneScreen()).toHaveAttribute("data-texts", "off");
  });

  it("treats a card without coordinates like one inside the area", () => {
    render(<DoneScreen driver={buildDriver({ inServiceArea: null })} onEdit={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You're in!");
  });

  it("puts a driver outside the launch area on the list, keeping the summary and the profile link", () => {
    render(
      <DoneScreen driver={buildDriver({ inServiceArea: false, zip: "75201" })} onEdit={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You're on the list.");
    expect(screen.getByText("Profile complete", { exact: true })).toBeInTheDocument();
    expect(doneText()).toHaveTextContent(
      "FleetGrid isn't in your area yet. We've saved your profile and will let you know when we launch near you.",
    );
    expect(doneText()).not.toHaveTextContent(REVIEW_TEXT);
    // No promise of shift offers where FleetGrid is not live.
    expect(nextSteps()).toEqual([
      "You can add your CDL and medical card any time from Documents.",
    ]);
    expect(doneScreen()).toHaveAttribute("data-area", "outside");
    expect(document.querySelector("[data-slot=summary-card]")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my profile" })).toHaveAttribute(
      "href",
      "/driver/profile",
    );
  });
});
