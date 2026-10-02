import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingStepper } from "@/components/driver/OnboardingStepper";
import {
  AvailabilityStep,
  BasicsStep,
  ConsentStep,
  DocumentsStep,
  DoneStep,
  LicensesStep,
} from "@/components/driver/OnboardingSteps";
import { SMS_CONSENT_TEXT } from "@/lib/constants";
import type { Result } from "@/server/errors/AppError";
import type { Driver } from "@/types/domain";
import { buildDriver, buildPartialDriver } from "../../setup/factories";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  saveOnboardingStepAction: vi.fn(),
  updateCardAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/driver.actions", () => actions);

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const failure = (message: string, fieldErrors?: Record<string, string>): Result<never> => ({
  ok: false,
  error: { code: "VALIDATION", message, fieldErrors },
});

const next = () => screen.getByRole("button", { name: "Next" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BasicsStep", () => {
  it("starts empty for a new driver, with the default radius", () => {
    render(<BasicsStep driver={null} onSave={vi.fn()} />);
    expect(screen.getByLabelText(/Full name/)).toHaveValue("");
    expect(screen.getByLabelText(/State/)).toHaveValue("");
    expect(screen.getByLabelText(/Service radius/)).toHaveValue(50);
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("lists every US state", () => {
    render(<BasicsStep driver={null} onSave={vi.fn()} />);
    expect(screen.getAllByRole("option")).toHaveLength(52);
    expect(screen.getByRole("option", { name: "Texas" })).toHaveValue("TX");
  });

  it("is prefilled from the saved card", () => {
    render(<BasicsStep driver={buildDriver({ serviceRadiusMiles: 120 })} onSave={vi.fn()} />);
    expect(screen.getByLabelText(/Full name/)).toHaveValue("Pat Driver");
    expect(screen.getByLabelText("City")).toHaveValue("Dallas");
    expect(screen.getByLabelText(/State/)).toHaveValue("TX");
    expect(screen.getByLabelText(/ZIP code/)).toHaveValue("75201");
    expect(screen.getByLabelText(/Service radius/)).toHaveValue(120);
  });

  it("shows field errors and does not save an empty form", async () => {
    const onSave = vi.fn();
    render(<BasicsStep driver={null} onSave={onSave} />);
    await userEvent.click(next());

    expect(await screen.findByText("Enter your full name")).toBeInTheDocument();
    expect(screen.getByText("Select your state")).toBeInTheDocument();
    expect(screen.getByText("Enter a 5-digit ZIP code")).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves validated, normalized values", async () => {
    const onSave = vi.fn().mockResolvedValue(ok({}));
    render(<BasicsStep driver={null} onSave={onSave} />);
    await userEvent.type(screen.getByLabelText(/Full name/), "  Pat Driver ");
    await userEvent.type(screen.getByLabelText("City"), "Dallas");
    await userEvent.selectOptions(screen.getByLabelText(/State/), "TX");
    await userEvent.type(screen.getByLabelText(/ZIP code/), "75201");
    await userEvent.clear(screen.getByLabelText(/Service radius/));
    await userEvent.type(screen.getByLabelText(/Service radius/), "120");
    await userEvent.click(next());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        fullName: "Pat Driver",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        serviceRadiusMiles: 120,
      }),
    );
  });

  it("rejects an out-of-range radius", async () => {
    const onSave = vi.fn();
    render(<BasicsStep driver={buildDriver()} onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText(/Service radius/));
    await userEvent.type(screen.getByLabelText(/Service radius/), "501");
    await userEvent.click(next());
    expect(await screen.findByText("Radius must be 500 miles or less")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("maps server field errors onto the fields", async () => {
    const onSave = vi.fn().mockResolvedValue(failure("Check the form", { zip: "ZIP not served" }));
    render(<BasicsStep driver={buildDriver()} onSave={onSave} />);
    await userEvent.click(next());
    expect(await screen.findByText("ZIP not served")).toBeInTheDocument();
    expect(screen.getByLabelText(/ZIP code/)).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a general server error when no field matches", async () => {
    const onSave = vi.fn().mockResolvedValue(failure("Only drivers can do this"));
    render(<BasicsStep driver={buildDriver()} onSave={onSave} />);
    await userEvent.click(next());
    expect(await screen.findByRole("alert")).toHaveTextContent("Only drivers can do this");
  });

  it("shows a general error for server errors on unknown fields", async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue(
        failure("Your card is missing information", { operatorTypes: "Required" }),
      );
    render(<BasicsStep driver={buildDriver()} onSave={onSave} />);
    await userEvent.click(next());
    expect(await screen.findByRole("alert")).toHaveTextContent("Your card is missing information");
  });

  it("disables the form while saving", async () => {
    let resolve!: (value: Result<unknown>) => void;
    const onSave = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));
    render(<BasicsStep driver={buildDriver()} onSave={onSave} />);
    await userEvent.click(next());

    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByLabelText(/Full name/)).toBeDisabled();
    await act(async () => resolve(ok({})));
  });
});

describe("LicensesStep", () => {
  it("starts with nothing selected for a new card", () => {
    render(<LicensesStep driver={buildPartialDriver()} onSave={vi.fn()} onBack={vi.fn()} />);
    for (const box of screen.getAllByRole("checkbox")) expect(box).not.toBeChecked();
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    expect(screen.getByLabelText(/Years of experience/)).toHaveValue(null);
  });

  it("hides endorsements until a CDL class is chosen, and for No CDL", async () => {
    render(<LicensesStep driver={buildPartialDriver()} onSave={vi.fn()} onBack={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "Endorsements" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Class B"));
    expect(screen.getByRole("group", { name: "Endorsements" })).toBeInTheDocument();

    await userEvent.click(screen.getByText("No CDL"));
    expect(screen.queryByRole("group", { name: "Endorsements" })).not.toBeInTheDocument();
  });

  it("requires role, class and experience", async () => {
    const onSave = vi.fn();
    render(<LicensesStep driver={buildPartialDriver()} onSave={onSave} onBack={vi.fn()} />);
    await userEvent.click(next());

    expect(await screen.findByText("Select at least one role")).toBeInTheDocument();
    expect(screen.getByText("Select your CDL class")).toBeInTheDocument();
    expect(screen.getByText("Enter your years of experience")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves the selections", async () => {
    const onSave = vi.fn().mockResolvedValue(ok({}));
    render(<LicensesStep driver={buildPartialDriver()} onSave={onSave} onBack={vi.fn()} />);
    await userEvent.click(screen.getByText("CDL driver"));
    await userEvent.click(screen.getByText("Mechanic"));
    await userEvent.click(screen.getByText("Class A"));
    await userEvent.click(screen.getByText("H - Hazardous materials"));
    await userEvent.type(screen.getByLabelText(/Years of experience/), "9");
    await userEvent.type(screen.getByRole("textbox", { name: "Certifications" }), "TWIC{Enter}");
    await userEvent.click(next());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        operatorTypes: ["cdl_driver", "mechanic"],
        cdlClass: "A",
        endorsements: ["H"],
        yearsExperience: 9,
        certifications: ["TWIC"],
      }),
    );
  });

  it("drops endorsements when switching to No CDL", async () => {
    const onSave = vi.fn().mockResolvedValue(ok({}));
    render(<LicensesStep driver={buildDriver()} onSave={onSave} onBack={vi.fn()} />);
    await userEvent.click(screen.getByText("No CDL"));
    await userEvent.click(next());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ cdlClass: "none", endorsements: [] }),
      ),
    );
  });

  it("is prefilled from the saved card and Back does not save", async () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    render(<LicensesStep driver={buildDriver()} onSave={onSave} onBack={onBack} />);
    expect(screen.getByRole("checkbox", { name: "CDL driver" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Class A" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^H -/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^T -/ })).toBeChecked();
    expect(screen.getByLabelText(/Years of experience/)).toHaveValue(8);
    expect(screen.getByText("TWIC")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows a server error for a certification on the certifications field", async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue(failure("Check the form", { "certifications.0": "Too long" }));
    render(<LicensesStep driver={buildDriver()} onSave={onSave} onBack={vi.fn()} />);
    await userEvent.click(next());
    expect(await screen.findByText("Too long")).toBeInTheDocument();
  });
});

describe("AvailabilityStep", () => {
  it("requires at least one option", async () => {
    const onSave = vi.fn();
    render(<AvailabilityStep driver={buildPartialDriver()} onSave={onSave} onBack={vi.fn()} />);
    await userEvent.click(next());
    expect(await screen.findByText("Select at least one option")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows a live character counter for the bio", async () => {
    render(<AvailabilityStep driver={buildPartialDriver()} onSave={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("0/500")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("About you"), "Hello");
    expect(screen.getByText("5/500")).toBeInTheDocument();
  });

  it("flags a bio over 500 characters", async () => {
    const onSave = vi.fn();
    render(
      <AvailabilityStep
        driver={buildDriver({ bio: "x".repeat(501) })}
        onSave={onSave}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText("501/500")).toHaveClass("text-destructive");
    await userEvent.click(next());
    expect(await screen.findByText("Bio must be 500 characters or fewer")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves availability, and an empty bio as null", async () => {
    const onSave = vi.fn().mockResolvedValue(ok({}));
    render(<AvailabilityStep driver={buildPartialDriver()} onSave={onSave} onBack={vi.fn()} />);
    await userEvent.click(screen.getByText("On call"));
    await userEvent.click(screen.getByText("Weekends"));
    await userEvent.click(next());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ availability: ["on_call", "weekends"], bio: null }),
    );
  });
});

describe("DocumentsStep", () => {
  it("can be skipped and renders the uploader slot", async () => {
    const onSave = vi.fn().mockResolvedValue(ok({}));
    render(
      <DocumentsStep driver={buildDriver()} onSave={onSave} onBack={vi.fn()}>
        <p>Uploader goes here</p>
      </DocumentsStep>,
    );
    expect(screen.getByText(/This step is optional/)).toBeInTheDocument();
    expect(screen.getByText("Uploader goes here")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({}));
  });

  it("shows a server error", async () => {
    const onSave = vi.fn().mockResolvedValue(failure("Finish the earlier steps first"));
    render(<DocumentsStep driver={buildDriver()} onSave={onSave} onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Finish the earlier steps first");
  });
});

describe("ConsentStep", () => {
  const checkbox = () => screen.getByRole("checkbox", { name: SMS_CONSENT_TEXT });
  const finish = () => screen.getByRole("button", { name: "Finish" });

  it("shows the exact consent text with an unchecked checkbox", () => {
    render(<ConsentStep driver={buildPartialDriver()} onSave={vi.fn()} onBack={vi.fn()} />);
    expect(
      screen.getByText(
        "I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.",
      ),
    ).toBeInTheDocument();
    expect(checkbox()).not.toBeChecked();
  });

  it("links to the SMS terms and privacy policy", () => {
    render(<ConsentStep driver={buildPartialDriver()} onSave={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("link", { name: "SMS Terms" })).toHaveAttribute("href", "/sms-terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  it("cannot finish without consent", async () => {
    const onSave = vi.fn();
    render(<ConsentStep driver={buildPartialDriver()} onSave={onSave} onBack={vi.fn()} />);
    await userEvent.click(finish());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You must agree to receive text messages to continue",
    );
    expect(checkbox()).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("checking and unchecking again still blocks", async () => {
    const onSave = vi.fn();
    render(<ConsentStep driver={buildPartialDriver()} onSave={onSave} onBack={vi.fn()} />);
    await userEvent.click(checkbox());
    await userEvent.click(checkbox());
    await userEvent.click(finish());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves consent when checked", async () => {
    const onSave = vi.fn().mockResolvedValue(ok({}));
    render(<ConsentStep driver={buildPartialDriver()} onSave={onSave} onBack={vi.fn()} />);
    await userEvent.click(checkbox());
    await userEvent.click(finish());
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ consent: true }));
  });

  it("is checked when consent is already on record", () => {
    render(<ConsentStep driver={buildDriver()} onSave={vi.fn()} onBack={vi.fn()} />);
    expect(checkbox()).toBeChecked();
  });

  it("shows a server error about missing card fields", async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue(
        failure("Your card is missing required information.", { availability: "Required" }),
      );
    render(<ConsentStep driver={buildPartialDriver()} onSave={onSave} onBack={vi.fn()} />);
    await userEvent.click(checkbox());
    await userEvent.click(finish());
    expect(
      await screen.findByText("Your card is missing required information."),
    ).toBeInTheDocument();
  });
});

describe("DoneStep", () => {
  it("shows the review message and a link to the profile", () => {
    render(<DoneStep />);
    expect(
      screen.getByText("Your profile is under review. You'll get texts when matching shifts open."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View my profile" })).toHaveAttribute(
      "href",
      "/driver/profile",
    );
  });
});

describe("OnboardingStepper", () => {
  const heading = (name: string) => screen.getByRole("heading", { level: 2, name });

  function savedAs(driver: Driver) {
    actions.saveOnboardingStepAction.mockResolvedValueOnce(ok(driver));
  }

  it("starts a new driver on step 1 with progress", () => {
    render(<OnboardingStepper initialStep={1} initialDriver={null} />);
    expect(heading("Your basics")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Onboarding progress" })).toBeInTheDocument();
  });

  it.each([
    [2, "Role and licenses"],
    [3, "Availability"],
    [4, "Documents"],
    [5, "Text message consent"],
  ])("resumes at step %i", (step, title) => {
    render(
      <OnboardingStepper
        initialStep={step}
        initialDriver={buildPartialDriver({ onboardingStep: step })}
      />,
    );
    expect(heading(title)).toBeInTheDocument();
    expect(screen.getByText(`Step ${step} of 5`)).toBeInTheDocument();
  });

  it("shows the done screen for a completed card", () => {
    render(<OnboardingStepper initialStep={6} initialDriver={buildDriver()} />);
    expect(screen.getByText(/Your profile is under review/)).toBeInTheDocument();
    expect(screen.queryByText(/Step \d of 5/)).not.toBeInTheDocument();
  });

  it("saves the current step number and moves forward, focusing the new heading", async () => {
    savedAs(buildPartialDriver());
    render(<OnboardingStepper initialStep={1} initialDriver={buildPartialDriver()} />);
    await userEvent.click(next());

    await waitFor(() => expect(heading("Role and licenses")).toBeInTheDocument());
    expect(actions.saveOnboardingStepAction).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ fullName: "Pat Driver", zip: "75201" }),
    );
    expect(heading("Role and licenses")).toHaveFocus();
  });

  it("stays on the step when the save fails", async () => {
    actions.saveOnboardingStepAction.mockResolvedValueOnce(failure("Something went wrong"));
    render(<OnboardingStepper initialStep={1} initialDriver={buildPartialDriver()} />);
    await userEvent.click(next());

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(heading("Your basics")).toBeInTheDocument();
  });

  it("Back returns to the previous step with the saved data, and step 1 has no Back", async () => {
    render(
      <OnboardingStepper initialStep={2} initialDriver={buildDriver({ onboardingStep: 2 })} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(heading("Your basics")).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toHaveValue("Pat Driver");
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(actions.saveOnboardingStepAction).not.toHaveBeenCalled();
  });

  it("carries data saved in one step into the next visit of that step", async () => {
    const afterStep1 = buildPartialDriver({ fullName: "New Name" });
    savedAs(afterStep1);
    render(<OnboardingStepper initialStep={1} initialDriver={buildPartialDriver()} />);
    await userEvent.clear(screen.getByLabelText(/Full name/));
    await userEvent.type(screen.getByLabelText(/Full name/), "New Name");
    await userEvent.click(next());
    await waitFor(() => expect(heading("Role and licenses")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText(/Full name/)).toHaveValue("New Name");
  });

  it("renders the uploader in step 4 and continues to consent", async () => {
    savedAs(buildPartialDriver({ onboardingStep: 5 }));
    render(
      <OnboardingStepper
        initialStep={4}
        initialDriver={buildPartialDriver({ onboardingStep: 4 })}
        documentUploader={<p>Uploader</p>}
      />,
    );
    expect(screen.getByText("Uploader")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(heading("Text message consent")).toBeInTheDocument());
    expect(actions.saveOnboardingStepAction).toHaveBeenCalledWith(4, {});
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("finishing consent shows the done screen and refreshes server data", async () => {
    savedAs(buildDriver());
    render(
      <OnboardingStepper
        initialStep={5}
        initialDriver={buildPartialDriver({ onboardingStep: 5 })}
      />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: SMS_CONSENT_TEXT }));
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));

    expect(await screen.findByText(/Your profile is under review/)).toBeInTheDocument();
    expect(actions.saveOnboardingStepAction).toHaveBeenCalledWith(5, { consent: true });
    expect(router.refresh).toHaveBeenCalledOnce();
  });
});
