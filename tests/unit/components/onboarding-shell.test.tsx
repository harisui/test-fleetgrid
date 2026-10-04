import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActionBar } from "@/components/onboarding/ActionBar";
import { LaneProgress } from "@/components/onboarding/LaneProgress";
import { OnboardingContent, OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { MILES, progressFor, STEPS } from "@/lib/onboarding/steps";

describe("LaneProgress", () => {
  it.each(STEPS.map((step) => [step.id] as const))(
    "%s: mile, label, fill and truck position all come from steps.ts",
    (stepId) => {
      const expected = progressFor(stepId);
      const { container } = render(<LaneProgress stepId={stepId} />);

      const bar = screen.getByRole("progressbar");
      expect(bar).toHaveAttribute("aria-valuemin", "1");
      expect(bar).toHaveAttribute("aria-valuemax", String(MILES.length));
      expect(bar).toHaveAttribute("aria-valuenow", String(expected.mile.mile));
      expect(bar).toHaveAttribute("aria-valuetext", expected.srLabel);

      const fill = container.querySelector("[data-slot=lane-fill]") as HTMLElement;
      const truck = container.querySelector("[data-slot=lane-truck]") as HTMLElement;
      expect(fill.style.width).toBe(`${expected.percent}%`);
      expect(truck.style.left).toBe(`${expected.percent}%`);
      expect(fill).toHaveClass("bg-progress-fill");
      expect(truck).toHaveClass("size-5", "text-foreground");
      expect(truck).toHaveAttribute("aria-hidden", "true");

      const stages = within(screen.getByRole("list", { name: "Stages" })).getAllByRole("listitem");
      // The visible text is only the label; the stage number is read by screen readers.
      expect(stages.map((item) => item.textContent?.trim())).toEqual(
        MILES.map((mile) =>
          expected.completedMiles.includes(mile.mile)
            ? `Stage ${mile.mile}, done:${mile.label}`
            : `Stage ${mile.mile}:${mile.label}`,
        ),
      );
      for (const item of stages) {
        expect(item.querySelector(".sr-only")).toHaveTextContent(/^Stage \d/);
      }
      const current = stages.find((item) => item.getAttribute("aria-current") === "step");
      expect(current).toHaveAttribute("data-mile", String(expected.mile.mile));
      expect(current).toHaveClass("underline", "font-semibold");
      for (const item of stages) {
        const state = item.getAttribute("data-state");
        const mile = Number(item.getAttribute("data-mile"));
        expect(state).toBe(
          expected.completedMiles.some((done) => done === mile)
            ? "done"
            : mile === expected.mile.mile
              ? "current"
              : "upcoming",
        );
      }
    },
  );

  it("moves only through a transition on the fill and truck, with no idle animation", () => {
    const { container } = render(<LaneProgress stepId="workType" />);
    const fill = container.querySelector("[data-slot=lane-fill]")!;
    const truck = container.querySelector("[data-slot=lane-truck]")!;
    expect(fill.getAttribute("class")).toContain("duration-(--dur-move)");
    expect(truck.getAttribute("class")).toContain("duration-(--dur-move)");
    expect(container.innerHTML).not.toMatch(/animate-/);
  });

  it("labels the stages About, Work, License, Papers, Finish", () => {
    render(<LaneProgress stepId="name" />);
    const stages = within(screen.getByRole("list", { name: "Stages" })).getAllByRole("listitem");
    expect(stages.map((item) => item.textContent?.replace(/Stage \d:/, "").trim())).toEqual([
      "About",
      "Work",
      "License",
      "Papers",
      "Finish",
    ]);
    // No visible numbers: the prototype shows the labels alone.
    for (const item of stages) {
      expect(item.querySelector("[aria-hidden]")).toBeNull();
    }
  });
});

describe("SignHeader", () => {
  it("renders the eyebrow for sighted users and the step text for screen readers", () => {
    render(
      <SignHeader
        eyebrow="Mile 2 of 5 · Work"
        title="What work do you do?"
        srText="Step 2 of 5: Work"
      />,
    );
    const heading = screen.getByRole("heading", { level: 1, name: "What work do you do?" });
    expect(heading).toHaveClass("font-heading", "text-h1", "font-bold");
    expect(heading).toHaveAttribute("tabindex", "-1");
    const eyebrow = screen.getByText("Mile 2 of 5 · Work");
    expect(eyebrow).toHaveAttribute("aria-hidden", "true");
    expect(eyebrow).toHaveClass("uppercase", "tracking-eyebrow", "text-sign-panel-muted");
    expect(screen.getByText("Step 2 of 5: Work")).toHaveClass("sr-only");
  });

  it("is a graphite panel with the orange stripe on top", () => {
    const { container } = render(
      <SignHeader eyebrow="Profile complete" title="You are listed." as="h2" />,
    );
    const panel = container.querySelector("[data-slot=sign-header]");
    expect(panel).toHaveClass(
      "bg-sign-panel",
      "border-t-4",
      "border-sign-panel-border",
      "rounded-sign",
    );
    expect(screen.getByRole("heading", { level: 2, name: "You are listed." })).toBeInTheDocument();
  });

  it.each(STEPS.map((step) => [step.id] as const))(
    "%s eyebrow is driven by progressFor",
    (stepId) => {
      const progress = progressFor(stepId);
      render(
        <SignHeader
          eyebrow={progress.eyebrow}
          title={progress.step.question}
          srText={progress.srLabel}
        />,
      );
      expect(screen.getByText(progress.eyebrow)).toBeInTheDocument();
      expect(screen.getByText(progress.srLabel)).toBeInTheDocument();
    },
  );
});

describe("ActionBar", () => {
  it("has a 56px orange Next that submits the form, and a secondary Back", async () => {
    const onBack = vi.fn();
    render(<ActionBar formId="screen-form" onBack={onBack} />);
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toHaveAttribute("type", "submit");
    expect(next).toHaveAttribute("form", "screen-form");
    expect(next).toHaveClass("h-target-lg", "bg-primary");
    const back = screen.getByRole("button", { name: "Back" });
    expect(back).toHaveClass("h-target-lg", "border-border-strong");
    await userEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("hides Back on the first screen and spans Next across the bar", () => {
    const { container } = render(<ActionBar formId="f" />);
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(container.querySelector(".grid")).toHaveClass("grid-cols-1");
  });

  it("shows Saved with a check in a live region, and can block or busy the Next button", () => {
    const { rerender } = render(<ActionBar formId="f" saved />);
    const indicator = screen.getByText("Saved");
    expect(indicator).toHaveAttribute("aria-live", "polite");
    expect(indicator.querySelector("svg")).toHaveClass("text-success");

    rerender(<ActionBar formId="f" nextDisabled nextLabel="Agree and finish" />);
    expect(screen.getByRole("button", { name: "Agree and finish" })).toBeDisabled();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();

    rerender(<ActionBar formId="f" pending onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("is sticky with safe-area padding", () => {
    const { container } = render(<ActionBar formId="f" />);
    const bar = container.querySelector("[data-slot=action-bar]");
    expect(bar).toHaveClass("sticky", "bottom-0", "bg-card");
    expect(bar?.className).toContain("safe-area-inset-bottom");
  });
});

describe("OnboardingShell", () => {
  it("shows only the wordmark, Help and the progress, with no app navigation", () => {
    render(
      <OnboardingShell stepId="experience">
        <OnboardingContent>
          <p>Question</p>
        </OnboardingContent>
        <ActionBar formId="f" />
      </OnboardingShell>,
    );
    expect(screen.getByText("FLEETGRID")).toHaveClass("font-heading");
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(within(screen.getByRole("main")).getByText("Question")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle dark mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.queryByText(/Set up your profile/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
  });

  it("Help opens the help sheet and passes the support contact through", async () => {
    render(
      <OnboardingShell stepId="name" support={{ email: "help@example.com" }}>
        <p>Question</p>
      </OnboardingShell>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Help" }));
    const sheet = await screen.findByRole("dialog", { name: "Help" });
    expect(within(sheet).getByText(/Every answer is saved as you go/)).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "help@example.com" })).toHaveAttribute(
      "href",
      "mailto:help@example.com",
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));
  });

  it("keeps the content column at the token width", () => {
    render(
      <OnboardingShell stepId="name">
        <OnboardingContent>
          <p>Question</p>
        </OnboardingContent>
      </OnboardingShell>,
    );
    expect(screen.getByText("Question").parentElement).toHaveClass("max-w-content");
  });

  it("puts the road and the action bar inside landmarks, so nothing floats outside them", () => {
    render(
      <OnboardingShell stepId="name">
        <OnboardingContent>
          <p>Question</p>
        </OnboardingContent>
        <ActionBar formId="f" />
      </OnboardingShell>,
    );
    expect(within(screen.getByRole("banner")).getByRole("progressbar")).toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).getByRole("button", { name: "Next" }),
    ).toBeInTheDocument();
  });
});
