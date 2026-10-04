import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DoneScreen } from "@/components/driver/DoneScreen";
import { buildDriver } from "../../setup/factories";

const PHONE = "+15555550100";
const nextSteps = () => within(screen.getByRole("list", { name: "What happens next" }));

describe("DoneScreen", () => {
  it("tells a driver inside the launch area they are listed, with every next step", () => {
    render(
      <DoneScreen driver={buildDriver({ inServiceArea: true })} phone={PHONE} onEdit={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You are listed.");
    expect(
      screen.getByText(/Once your profile is approved, carriers near 75201 can find you/),
    ).toBeInTheDocument();
    expect(
      nextSteps()
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "A FleetGrid reviewer will check your profile.",
      "Shift offers arrive by text. Reply YES to claim one.",
      "You can add your CDL and medical card any time from Documents.",
    ]);
    expect(document.querySelector("[data-slot=done-screen]")).toHaveAttribute(
      "data-area",
      "inside",
    );
    expect(screen.queryByText(/isn't in your area/)).not.toBeInTheDocument();
  });

  it("treats a card without coordinates like one inside the area", () => {
    render(
      <DoneScreen driver={buildDriver({ inServiceArea: null })} phone={PHONE} onEdit={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You are listed.");
  });

  it("puts a driver outside the launch area on the list, keeping the summary and the profile link", () => {
    render(
      <DoneScreen
        driver={buildDriver({ inServiceArea: false, zip: "75201" })}
        phone={PHONE}
        onEdit={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You're on the list.");
    expect(screen.getByText("Profile complete", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText("FleetGrid isn't in your area yet. We'll text you when it is."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/carriers near 75201/)).not.toBeInTheDocument();
    // No promise of shift offers where FleetGrid is not live.
    expect(
      nextSteps()
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "A FleetGrid reviewer will check your profile.",
      "You can add your CDL and medical card any time from Documents.",
    ]);
    expect(document.querySelector("[data-slot=done-screen]")).toHaveAttribute(
      "data-area",
      "outside",
    );
    expect(document.querySelector("[data-slot=summary-card]")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to my profile" })).toHaveAttribute(
      "href",
      "/driver/profile",
    );
  });
});
