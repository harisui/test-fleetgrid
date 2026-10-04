import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "@/components/driver/OnboardingFlow";
import { SMS_CONSENT_TEXT } from "@/lib/constants";
import { SAVABLE_STEP_IDS, STEPS, type StepId } from "@/lib/onboarding/steps";
import type { Result } from "@/server/errors/AppError";
import type { LocatedDriver } from "@/types/domain";
import { buildDriver, buildPartialDriver } from "../../setup/factories";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  saveOnboardingScreenAction: vi.fn(),
  lookupZipAction: vi.fn(),
  prepareDocumentUploadAction: vi.fn(),
  confirmDocumentUploadAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
  getDocumentPreviewUrlAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/driver.actions", () => actions);
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/supabase/upload", () => ({ uploadWithToken: vi.fn().mockResolvedValue(true) }));

const PHONE = "+15555550100";
const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const failure = (message: string, fieldErrors?: Record<string, string>): Result<never> => ({
  ok: false,
  error: { code: "VALIDATION", message, fieldErrors },
});

const next = () => screen.getByRole("button", { name: "Next" });
const heading = () => screen.getByRole("heading", { level: 1 });

function renderFlow(stepId: StepId, driver: LocatedDriver | null = buildPartialDriver()) {
  return render(
    <OnboardingFlow
      initialStepId={stepId}
      initialDriver={driver}
      phone={PHONE}
      initialDocuments={[]}
    />,
  );
}

function stubDesktop(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.lookupZipAction.mockResolvedValue(ok(null));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("first load", () => {
  it.each(SAVABLE_STEP_IDS)("%s shows the question, no error and no app navigation", (stepId) => {
    const driver =
      stepId === "name" ? null : buildPartialDriver({ onboardingStep: 13, cdlClass: "A" });
    renderFlow(stepId, driver);
    const step = STEPS.find((candidate) => candidate.id === stepId)!;
    expect(heading()).toHaveTextContent(step.question);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelectorAll("[aria-invalid='true']")).toHaveLength(0);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute(
      "aria-valuetext",
      expect.stringMatching(/^Step \d of 5: /),
    );
  });

  it("the name screen has no Back; later screens do", () => {
    renderFlow("name", null);
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("shows Saved on a screen that was already answered", () => {
    renderFlow("zip", buildPartialDriver({ onboardingStep: 4, zip: "75201", state: "TX" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});

describe("name and ZIP", () => {
  it("validates only after Next, then saves and moves to the ZIP screen", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(buildPartialDriver()));
    renderFlow("name", null);
    const field = screen.getByLabelText("Full name");
    await userEvent.type(field, "P");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.click(next());
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your name");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(actions.saveOnboardingScreenAction).not.toHaveBeenCalled();

    await userEvent.type(field, "at Driver");
    await userEvent.click(next());
    await waitFor(() => expect(heading()).toHaveTextContent("What is your ZIP code?"));
    expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("name", {
      fullName: "Pat Driver",
    });
    expect(heading()).toHaveFocus();
  });

  it("tells a driver outside the launch area so, as information, and keeps going", async () => {
    actions.lookupZipAction.mockImplementation(async (zip: string) =>
      ok(
        zip === "75201"
          ? { zip, city: "Dallas", state: "TX", inServiceArea: false }
          : { zip, city: "Houston", state: "TX", inServiceArea: true },
      ),
    );
    renderFlow("zip");
    const note = () => document.querySelector("[data-slot=launch-area-note]");

    await userEvent.type(screen.getByLabelText("ZIP code"), "75201");
    await waitFor(() => expect(screen.getByLabelText("City")).toHaveValue("Dallas"));
    expect(note()).toHaveTextContent(
      "FleetGrid is launching in the Houston area first. You can still sign up. We'll text you when we launch near you.",
    );
    expect(note()).toHaveAttribute("data-variant", "info");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-invalid='true']")).toBeNull();
    expect(next()).toBeEnabled();

    await userEvent.clear(screen.getByLabelText("ZIP code"));
    await userEvent.type(screen.getByLabelText("ZIP code"), "77002");
    await waitFor(() => expect(screen.getByLabelText("City")).toHaveValue("Houston"));
    expect(note()).toBeNull();
  });

  it("fills in the city and state from the ZIP and keeps them editable", async () => {
    actions.lookupZipAction.mockResolvedValue(
      ok({ zip: "60601", city: "Chicago", state: "IL", inServiceArea: true }),
    );
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 3 })),
    );
    renderFlow("zip");
    await userEvent.type(screen.getByLabelText("ZIP code"), "60601");

    await waitFor(() => expect(screen.getByLabelText("City")).toHaveValue("Chicago"));
    expect(screen.getByRole("combobox", { name: "State" })).toHaveTextContent("Illinois");
    expect(screen.getByText(/City and state filled in from your ZIP/)).toBeInTheDocument();
    expect(actions.lookupZipAction).toHaveBeenCalledWith("60601");

    await userEvent.clear(screen.getByLabelText("City"));
    await userEvent.type(screen.getByLabelText("City"), "Evanston");
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("zip", {
        zip: "60601",
        city: "Evanston",
        state: "IL",
      }),
    );
  });

  it("explains when a ZIP is unknown and asks for a 5-digit ZIP on Next", async () => {
    renderFlow("zip");
    await userEvent.type(screen.getByLabelText("ZIP code"), "99999");
    await waitFor(() => expect(screen.getByText(/We could not find that ZIP/)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText("ZIP code"));
    await userEvent.type(screen.getByLabelText("ZIP code"), "6060");
    await userEvent.click(next());
    expect(await screen.findByText("Enter a 5-digit ZIP code, like 60601")).toBeInTheDocument();
    expect(screen.getByText("Select your state")).toBeInTheDocument();
  });

  it("Back returns to the previous question with the saved answer", async () => {
    renderFlow("zip", buildPartialDriver({ fullName: "Pat Driver" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(heading()).toHaveTextContent("What is your name?");
    expect(screen.getByLabelText("Full name")).toHaveValue("Pat Driver");
  });
});

describe("work screens", () => {
  it("distance chips save the picked value and show where from", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 4 })),
    );
    renderFlow(
      "distance",
      buildPartialDriver({ onboardingStep: 3, city: "Dallas", state: "TX", zip: "75201" }),
    );
    expect(screen.getByText(/From Dallas, TX 75201/)).toBeInTheDocument();
    await userEvent.click(next());
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick how far you will travel");

    await userEvent.click(screen.getByRole("button", { name: "100 miles" }));
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("distance", {
        serviceRadiusMiles: 100,
      }),
    );
  });

  it("work type cards are checkboxes and at least one is required", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 5 })),
    );
    renderFlow("workType", buildPartialDriver({ onboardingStep: 4 }));
    await userEvent.click(next());
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick at least one kind of work");
    await userEvent.click(screen.getByRole("checkbox", { name: /Yard spotter/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /CDL driver/ }));
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("workType", {
        operatorTypes: ["yard_spotter", "cdl_driver"],
      }),
    );
  });

  it("experience chips store the lower bound and the stepper refines it", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 6 })),
    );
    renderFlow("experience", buildPartialDriver({ onboardingStep: 5 }));
    await userEvent.click(screen.getByRole("button", { name: "3 to 5" }));
    expect(screen.getByLabelText("Exact number (optional)")).toHaveValue("3");
    await userEvent.click(screen.getByRole("button", { name: "One year more" }));
    expect(screen.getByRole("button", { name: "3 to 5" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("experience", {
        yearsExperience: 4,
      }),
    );
  });

  it("availability saves the picked cards", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 7 })),
    );
    renderFlow("availability", buildPartialDriver({ onboardingStep: 6 }));
    await userEvent.click(screen.getByRole("checkbox", { name: /On call/ }));
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("availability", {
        availability: ["on_call"],
      }),
    );
  });
});

describe("license screens", () => {
  it("a CDL driver who picks No CDL sees the warning and cannot continue", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 8, cdlClass: "A" })),
    );
    renderFlow(
      "cdlClass",
      buildPartialDriver({ onboardingStep: 7, operatorTypes: ["cdl_driver"] }),
    );
    expect(next()).toBeEnabled();
    await userEvent.click(screen.getByRole("radio", { name: /No CDL/ }));
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent(
      "CDL driver work needs a CDL. Pick your class, or change your work type.",
    );
    expect(warning.querySelector("svg")).not.toBeNull();
    expect(next()).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: /Class A/ }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(next()).toBeEnabled();
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("cdlClass", {
        cdlClass: "A",
      }),
    );
  });

  it("a yard spotter can pick No CDL and skips endorsements", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(
        buildPartialDriver({
          onboardingStep: 9,
          operatorTypes: ["yard_spotter"],
          cdlClass: "none",
        }),
      ),
    );
    renderFlow(
      "cdlClass",
      buildPartialDriver({ onboardingStep: 7, operatorTypes: ["yard_spotter"] }),
    );
    await userEvent.click(screen.getByRole("radio", { name: /No CDL/ }));
    expect(next()).toBeEnabled();
    await userEvent.click(next());
    await waitFor(() => expect(heading()).toHaveTextContent("Do you have any certifications?"));
  });

  it("X picks H and N with a note, dropping N drops X, and None clears everything", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 9, cdlClass: "A" })),
    );
    renderFlow("endorsements", buildPartialDriver({ onboardingStep: 8, cdlClass: "A" }));
    expect(screen.getByRole("img", { name: /front of a CDL/ })).toBeInTheDocument();
    expect(screen.getByText(/These are called endorsements/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /^X\b/ }));
    for (const letter of ["X", "H", "N"]) {
      expect(screen.getByRole("checkbox", { name: new RegExp(`^${letter}\\b`) })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    }
    expect(screen.getByText("X includes H and N.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /^N\b/ }));
    expect(screen.getByRole("checkbox", { name: /^X\b/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("checkbox", { name: /^H\b/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("X includes H and N.")).not.toBeInTheDocument();

    // S (school bus) needs P (passengers).
    await userEvent.click(screen.getByRole("checkbox", { name: /^S\b/ }));
    expect(screen.getByRole("checkbox", { name: /^P\b/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/S includes P\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /^P\b/ }));
    expect(screen.getByRole("checkbox", { name: /^S\b/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText(/S includes P\./)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /^None/ }));
    expect(screen.getByRole("checkbox", { name: /^None/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: /^H\b/ })).toHaveAttribute("aria-checked", "false");

    await userEvent.click(screen.getByRole("checkbox", { name: /^T\b/ }));
    expect(screen.getByRole("checkbox", { name: /^None/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("endorsements", {
        endorsements: ["T"],
      }),
    );
  });

  it("certifications are chips plus a typed entry", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 10 })),
    );
    renderFlow("certifications", buildPartialDriver({ onboardingStep: 9, cdlClass: "A" }));
    await userEvent.click(screen.getByRole("button", { name: "TWIC" }));
    await userEvent.click(screen.getByRole("button", { name: "Add another" }));
    await userEvent.type(screen.getByLabelText("Other certification"), "Hazmat awareness{Enter}");
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("certifications", {
        certifications: ["TWIC", "Hazmat awareness"],
      }),
    );
  });
});

describe("papers, about you, consent, done", () => {
  it("papers can be skipped and shows the four tiles", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 11 })),
    );
    renderFlow("documents", buildPartialDriver({ onboardingStep: 10, cdlClass: "A" }));
    expect(screen.getByText("Front of your CDL")).toBeInTheDocument();
    expect(screen.getByText("Back of your CDL")).toBeInTheDocument();
    expect(screen.getByText("Medical card")).toBeInTheDocument();
    expect(screen.getByText("Other papers")).toBeInTheDocument();
    expect(screen.getByText("TWIC card, forklift card, other certificates")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Take a photo" })).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("documents", {}),
    );
  });

  it("about you counts characters and saves blank as nothing", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 12 })),
    );
    renderFlow("bio", buildPartialDriver({ onboardingStep: 11 }));
    expect(screen.getByText("0 / 500")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("About you"), "Hello");
    expect(screen.getByText("5 / 500")).toBeInTheDocument();
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("bio", { bio: "Hello" }),
    );
  });

  it("consent must be ticked, then finishing shows the done screen and refreshes", async () => {
    const complete = buildDriver({ onboardingStep: 13, cardCompleted: true });
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(complete));
    renderFlow("consent", buildPartialDriver({ onboardingStep: 12 }));
    expect(
      screen.getByText(/Shift offers come by text to \(\*\*\*\) \*\*\*-0100/),
    ).toBeInTheDocument();
    const finish = screen.getByRole("button", { name: "Agree and finish" });
    await userEvent.click(finish);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tap the box to agree before you finish",
    );
    expect(actions.saveOnboardingScreenAction).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("checkbox", { name: new RegExp(SMS_CONSENT_TEXT.slice(0, 20)) }),
    );
    await userEvent.click(finish);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You are listed."),
    );
    expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("consent", { consent: true });
    expect(router.refresh).toHaveBeenCalledOnce();
    // Drivers start as pending: the done screen promises nothing that depends on approval.
    expect(
      screen.getByText(/Once your profile is approved, carriers near 75201 can find you/),
    ).toBeInTheDocument();
    expect(screen.getByText("A FleetGrid reviewer will check your profile.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/can now find you|business day|within \d/);
    expect(screen.getByRole("link", { name: "Go to my profile" })).toHaveAttribute(
      "href",
      "/driver/profile",
    );
    const summary = within(document.querySelector("[data-slot=summary-card]") as HTMLElement);
    expect(summary.getByText("Class A")).toBeInTheDocument();
    expect(summary.getByText("H, T")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/animate-/);

    await userEvent.click(summary.getByRole("button", { name: "Edit availability" }));
    expect(heading()).toHaveTextContent("When can you work?");
    expect(screen.getByRole("checkbox", { name: /Full time/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("shows a server error without a matching field as a note", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(failure("Finish the earlier steps first"));
    renderFlow("bio", buildPartialDriver({ onboardingStep: 11 }));
    await userEvent.click(next());
    expect(await screen.findByRole("alert")).toHaveTextContent("Finish the earlier steps first");
    expect(heading()).toHaveTextContent("Anything carriers should know?");
  });

  it("maps a server field error onto its field", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      failure("Check the form", { fullName: "Too short" }),
    );
    renderFlow("name", buildPartialDriver({ fullName: "Pat Driver" }));
    await userEvent.click(next());
    expect(await screen.findByText("Too short")).toBeInTheDocument();
  });
});

describe("desktop grouping", () => {
  it("shows a whole mile under one sign and saves each screen in order", async () => {
    stubDesktop(true);
    actions.saveOnboardingScreenAction
      .mockResolvedValueOnce(
        ok(buildPartialDriver({ onboardingStep: 5, operatorTypes: ["mechanic"] })),
      )
      .mockResolvedValueOnce(
        ok(
          buildPartialDriver({
            onboardingStep: 6,
            operatorTypes: ["mechanic"],
            yearsExperience: 1,
          }),
        ),
      )
      .mockResolvedValueOnce(
        ok(
          buildPartialDriver({
            onboardingStep: 7,
            operatorTypes: ["mechanic"],
            yearsExperience: 1,
            availability: ["weekends"],
          }),
        ),
      );
    renderFlow("workType", buildPartialDriver({ onboardingStep: 4 }));
    expect(heading()).toHaveTextContent("Work");
    expect(screen.getByText("Mile 2 of 5")).toBeInTheDocument();
    for (const question of [
      "What work do you do?",
      "How many years have you done this work?",
      "When can you work?",
    ]) {
      expect(screen.getByText(question)).not.toHaveClass("sr-only");
    }

    await userEvent.click(screen.getByRole("checkbox", { name: /Mechanic/ }));
    await userEvent.click(screen.getByRole("button", { name: "1 to 2" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Weekends/ }));
    await userEvent.click(next());

    await waitFor(() => expect(actions.saveOnboardingScreenAction).toHaveBeenCalledTimes(3));
    expect(actions.saveOnboardingScreenAction.mock.calls.map((call) => call[0])).toEqual([
      "workType",
      "experience",
      "availability",
    ]);
    await waitFor(() => expect(heading()).toHaveTextContent("License"));
  });

  it("shows the endorsements question as soon as a CDL class is picked, and hides it for No CDL", async () => {
    stubDesktop(true);
    actions.saveOnboardingScreenAction.mockImplementation(async () =>
      ok(buildPartialDriver({ onboardingStep: 10, cdlClass: "A", endorsements: ["H"] })),
    );
    renderFlow("cdlClass", buildPartialDriver({ onboardingStep: 7, operatorTypes: ["mechanic"] }));
    expect(heading()).toHaveTextContent("License");
    expect(screen.queryByText("Any extra letters on your CDL?")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Class A/ }));
    expect(screen.getByText("Any extra letters on your CDL?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /^H\b/ }));

    await userEvent.click(screen.getByRole("radio", { name: /No CDL/ }));
    expect(screen.queryByText("Any extra letters on your CDL?")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Class A/ }));
    expect(screen.getByRole("checkbox", { name: /^H\b/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(next());

    await waitFor(() => expect(actions.saveOnboardingScreenAction).toHaveBeenCalledTimes(3));
    expect(actions.saveOnboardingScreenAction.mock.calls.map((call) => call[0])).toEqual([
      "cdlClass",
      "endorsements",
      "certifications",
    ]);
    expect(actions.saveOnboardingScreenAction.mock.calls[1][1]).toEqual({ endorsements: ["H"] });
  });

  it("saves no endorsements for No CDL on a wide screen", async () => {
    stubDesktop(true);
    actions.saveOnboardingScreenAction.mockImplementation(async () =>
      ok(buildPartialDriver({ onboardingStep: 10, cdlClass: "none" })),
    );
    renderFlow("cdlClass", buildPartialDriver({ onboardingStep: 7, operatorTypes: ["mechanic"] }));
    await userEvent.click(screen.getByRole("radio", { name: /No CDL/ }));
    await userEvent.click(next());
    await waitFor(() => expect(actions.saveOnboardingScreenAction).toHaveBeenCalledTimes(2));
    expect(actions.saveOnboardingScreenAction.mock.calls.map((call) => call[0])).toEqual([
      "cdlClass",
      "certifications",
    ]);
  });

  it("stops at the first screen with an error", async () => {
    stubDesktop(true);
    renderFlow("workType", buildPartialDriver({ onboardingStep: 4 }));
    await userEvent.click(screen.getByRole("button", { name: "Under 1" }));
    await userEvent.click(next());
    expect(await screen.findByText("Pick at least one kind of work")).toBeInTheDocument();
    expect(screen.getByText("Pick at least one option")).toBeInTheDocument();
    expect(actions.saveOnboardingScreenAction).not.toHaveBeenCalled();
  });
});

describe("the road", () => {
  it("stays mounted from one step to the next, so the fill and truck can animate", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 2, fullName: "Pat Driver" })),
    );
    const { container } = renderFlow("name", null);
    const fill = container.querySelector("[data-slot=lane-fill]") as HTMLElement;
    const truck = container.querySelector("[data-slot=lane-truck]") as HTMLElement;
    expect(fill.style.width).toBe("0%");

    await userEvent.type(screen.getByLabelText("Full name"), "Pat Driver");
    await userEvent.click(next());
    await waitFor(() => expect(heading()).toHaveTextContent("What is your ZIP code?"));

    expect(container.querySelector("[data-slot=lane-fill]")).toBe(fill);
    expect(container.querySelector("[data-slot=lane-truck]")).toBe(truck);
    expect(fill.style.width).toBe("8%");
    expect(truck.style.left).toBe("8%");
  });
});

describe("resume", () => {
  it("opens on the step the server reports with the saved answers", async () => {
    renderFlow("experience", buildPartialDriver({ onboardingStep: 5, yearsExperience: 8 }));
    expect(heading()).toHaveTextContent("How many years have you done this work?");
    expect(screen.getByRole("button", { name: "6 to 10" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Exact number (optional)")).toHaveValue("8");
    await act(async () => undefined);
  });
});
