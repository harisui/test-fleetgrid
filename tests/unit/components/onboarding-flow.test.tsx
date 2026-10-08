import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "@/components/driver/OnboardingFlow";
import { SMS_CONSENT_TEXT } from "@/lib/constants";
import { CARD_CHECKS, EMPLOYMENT_HELPER } from "@/lib/onboarding/options";
import { SAVABLE_STEP_IDS, STEPS, type StepId } from "@/lib/onboarding/steps";
import {
  CLEARINGHOUSE_MESSAGE,
  DRIVING_STYLE_MESSAGE,
  EMPLOYMENT_MESSAGE,
  EQUIPMENT_MESSAGE,
  MEDICAL_CARD_MESSAGE,
  MVR_MESSAGE,
  TRANSMISSION_MESSAGE,
  TWIC_MESSAGE,
} from "@/lib/validation/onboarding.schema";
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
/** The read-only "City, ST" line under the ZIP field. */
const place = () => document.querySelector("[data-slot=zip-place]");
const chip = (name: string) => screen.getByRole("button", { name });
/** The chip of one yes-or-no question, found through the question's group. */
const checkChip = (question: string, name: string) =>
  within(screen.getByRole("group", { name: question })).getByRole("button", { name });
/** A CDL driver part-way through the flow. */
const cdlDriverAt = (onboardingStep: number, overrides: Partial<LocatedDriver> = {}) =>
  buildPartialDriver({ onboardingStep, operatorTypes: ["cdl_driver"], ...overrides });

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

describe("scroll hint", () => {
  /** A page taller than the viewport, scrolled to the top. */
  function stubTallPage() {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800,
    });
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
  }
  const hint = () => screen.queryByRole("button", { name: "Scroll down for more" });

  it("shows on the Work mile on a wide screen, where the questions run past the fold", () => {
    stubDesktop(true);
    stubTallPage();
    renderFlow("workType", buildPartialDriver({ onboardingStep: 4 }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Work");
    expect(hint()).toBeInTheDocument();
  });

  it.each(["name", "cdlClass", "documents", "bio"] as const)(
    "does not show on the %s page on a wide screen",
    (stepId) => {
      stubDesktop(true);
      stubTallPage();
      renderFlow(stepId, buildDriver({ onboardingStep: 18, cardCompleted: false }));
      expect(hint()).not.toBeInTheDocument();
    },
  );

  it("does not show on a phone, where each question has its own screen", () => {
    stubDesktop(false);
    stubTallPage();
    renderFlow("workType", buildPartialDriver({ onboardingStep: 4 }));
    expect(hint()).not.toBeInTheDocument();
  });
});

describe("first load", () => {
  it.each(SAVABLE_STEP_IDS)("%s shows the question, no error and no app navigation", (stepId) => {
    const driver =
      stepId === "name" ? null : buildPartialDriver({ onboardingStep: 18, cdlClass: "A" });
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
    await waitFor(() => expect(place()).toHaveTextContent("Dallas, TX"));
    expect(note()).toHaveTextContent(
      "FleetGrid is launching in the Houston area first. You can still sign up. We'll text you when we launch near you.",
    );
    expect(note()).toHaveAttribute("data-variant", "info");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-invalid='true']")).toBeNull();
    expect(next()).toBeEnabled();

    await userEvent.clear(screen.getByLabelText("ZIP code"));
    await userEvent.type(screen.getByLabelText("ZIP code"), "77002");
    await waitFor(() => expect(place()).toHaveTextContent("Houston, TX"));
    expect(note()).toBeNull();
  });

  it("shows the city and state from the ZIP as one read-only line and saves only the ZIP", async () => {
    actions.lookupZipAction.mockResolvedValue(
      ok({ zip: "60601", city: "Chicago", state: "IL", inServiceArea: true }),
    );
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(buildPartialDriver({ onboardingStep: 3 })),
    );
    renderFlow("zip");
    expect(place()).toBeNull();
    await userEvent.type(screen.getByLabelText("ZIP code"), "60601");

    await waitFor(() => expect(place()).toHaveTextContent("Chicago, IL"));
    expect(screen.queryByLabelText("City")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "State" })).not.toBeInTheDocument();
    expect(screen.getByText(/City and state filled in from your ZIP/)).toBeInTheDocument();
    expect(document.querySelector("[data-slot=field-success]")).not.toBeNull();
    expect(actions.lookupZipAction).toHaveBeenCalledWith("60601");

    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("zip", { zip: "60601" }),
    );
  });

  it("shows the saved place at once, before the lookup answers", () => {
    renderFlow(
      "zip",
      buildPartialDriver({ onboardingStep: 3, zip: "77002", city: "Houston", state: "TX" }),
    );
    expect(place()).toHaveTextContent("Houston, TX");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("stops on a ZIP the dataset does not know, and lets go once a known one is typed", async () => {
    actions.lookupZipAction.mockImplementation(async (zip: string) =>
      ok(zip === "60601" ? { zip, city: "Chicago", state: "IL", inServiceArea: true } : null),
    );
    renderFlow("zip");
    const field = screen.getByLabelText("ZIP code");
    await userEvent.type(field, "99999");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not find that ZIP. Check the number.",
    );
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(place()).toBeNull();
    await waitFor(() => expect(next()).toBeDisabled());
    expect(actions.saveOnboardingScreenAction).not.toHaveBeenCalled();

    await userEvent.clear(field);
    await userEvent.type(field, "60601");
    await waitFor(() => expect(place()).toHaveTextContent("Chicago, IL"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(next()).toBeEnabled();

    // Fewer than five digits is the schema's error, on Next.
    await userEvent.clear(field);
    await userEvent.type(field, "6060");
    await userEvent.click(next());
    expect(await screen.findByText("Enter a 5-digit ZIP code, like 60601")).toBeInTheDocument();
  });

  it("shows the server's answer when it rejects the ZIP", async () => {
    actions.lookupZipAction.mockResolvedValue(
      ok({ zip: "60601", city: "Chicago", state: "IL", inServiceArea: true }),
    );
    actions.saveOnboardingScreenAction.mockResolvedValue(
      failure("Check the form", { zip: "We could not find that ZIP. Check the number." }),
    );
    renderFlow("zip");
    await userEvent.type(screen.getByLabelText("ZIP code"), "60601");
    await waitFor(() => expect(place()).toHaveTextContent("Chicago, IL"));
    await userEvent.click(next());
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not find that ZIP");
    expect(heading()).toHaveTextContent("What is your ZIP code?");
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

    await userEvent.click(chip("100 miles"));
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

  it("employment type is one card of three, required, with a line explaining W-2 and 1099", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(6)));
    renderFlow("employmentType", cdlDriverAt(5));
    expect(screen.getByText(EMPLOYMENT_HELPER)).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    await userEvent.click(next());
    expect(await screen.findByRole("alert")).toHaveTextContent(EMPLOYMENT_MESSAGE);
    expect(actions.saveOnboardingScreenAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("radio", { name: /1099 owner-operator/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Either works/ }));
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("employmentType", {
        employmentType: "either",
      }),
    );
  });

  it("driving style cards are checkboxes and at least one is required", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(7)));
    renderFlow("drivingStyle", cdlDriverAt(6));
    await userEvent.click(next());
    expect(await screen.findByRole("alert")).toHaveTextContent(DRIVING_STYLE_MESSAGE);

    await userEvent.click(screen.getByRole("checkbox", { name: /Local day cab/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /OTR/ }));
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("drivingStyle", {
        drivingStyles: ["local_day_cab", "otr"],
      }),
    );
  });

  it("equipment chips and the transmission cards share a screen, both required", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(8)));
    renderFlow("equipment", cdlDriverAt(7));
    expect(screen.getByText("Can you drive a manual?")).toBeInTheDocument();
    await userEvent.click(next());
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      EQUIPMENT_MESSAGE,
      TRANSMISSION_MESSAGE,
    ]);

    await userEvent.click(chip("Dry van"));
    await userEvent.click(chip("Reefer"));
    await userEvent.click(screen.getByRole("radio", { name: /Automatic only/ }));
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("equipment", {
        equipmentTypes: ["dry_van", "reefer"],
        transmission: "automatic_only",
      }),
    );
  });

  it("experience chips store the lower bound of the range, with no exact-number field", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(9)));
    renderFlow("experience", cdlDriverAt(8));
    expect(screen.queryByLabelText("Exact number (optional)")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "One year more" })).not.toBeInTheDocument();
    await userEvent.click(chip("3 to 5"));
    expect(chip("3 to 5")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("experience", {
        yearsExperience: 3,
      }),
    );
  });

  it("availability saves the picked cards", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(10)));
    renderFlow("availability", cdlDriverAt(9));
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
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(11, { cdlClass: "A" })));
    renderFlow("cdlClass", cdlDriverAt(10));
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
          onboardingStep: 12,
          operatorTypes: ["yard_spotter"],
          cdlClass: "none",
        }),
      ),
    );
    renderFlow(
      "cdlClass",
      buildPartialDriver({ onboardingStep: 10, operatorTypes: ["yard_spotter"] }),
    );
    await userEvent.click(screen.getByRole("radio", { name: /No CDL/ }));
    expect(next()).toBeEnabled();
    await userEvent.click(next());
    await waitFor(() => expect(heading()).toHaveTextContent("Do you have any certifications?"));
  });

  it("X picks H and N with a note, dropping N drops X, and None clears everything", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(12, { cdlClass: "A" })));
    renderFlow("endorsements", cdlDriverAt(11, { cdlClass: "A" }));
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

  it("certifications are chips plus a typed entry, without a TWIC chip", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(13)));
    renderFlow("certifications", cdlDriverAt(12, { cdlClass: "A" }));
    expect(screen.queryByRole("button", { name: "TWIC" })).not.toBeInTheDocument();
    await userEvent.click(chip("Forklift"));
    await userEvent.click(chip("Add another"));
    await userEvent.type(screen.getByLabelText("Other certification"), "Hazmat awareness{Enter}");
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("certifications", {
        certifications: ["Forklift", "Hazmat awareness"],
      }),
    );
  });

  it("the cards screen asks TWIC and medical card as two yes-or-no questions, both required", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(14)));
    renderFlow("credentials", cdlDriverAt(13));
    const twic = CARD_CHECKS.twicActive.question;
    const medical = CARD_CHECKS.medicalCardActive.question;
    expect(screen.getByRole("group", { name: twic })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: medical })).toBeInTheDocument();
    await userEvent.click(next());
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((alert) => alert.textContent)).toEqual([TWIC_MESSAGE, MEDICAL_CARD_MESSAGE]);

    await userEvent.click(checkChip(twic, "Yes"));
    await userEvent.click(checkChip(medical, "No"));
    expect(checkChip(twic, "Yes")).toHaveAttribute("aria-pressed", "true");
    expect(checkChip(medical, "No")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("credentials", {
        twicActive: true,
        medicalCardActive: false,
      }),
    );
  });

  it("the cards screen shows saved answers as pressed chips", () => {
    renderFlow("credentials", cdlDriverAt(14, { twicActive: false, medicalCardActive: true }));
    expect(checkChip(CARD_CHECKS.twicActive.question, "No")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(checkChip(CARD_CHECKS.medicalCardActive.question, "Yes")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});

describe("papers, record, about you, consent, done", () => {
  it("papers can be skipped and shows the four tiles", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(15)));
    renderFlow("documents", cdlDriverAt(14, { cdlClass: "A" }));
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

  it("the record screen asks Clearinghouse and MVR with their own chip words", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(16)));
    renderFlow("compliance", cdlDriverAt(15));
    const clearinghouse = CARD_CHECKS.clearinghouseRegistered.question;
    const mvr = CARD_CHECKS.mvrClean3Years.question;
    expect(screen.getByText("Carriers check both before booking a shift.")).toBeInTheDocument();
    await userEvent.click(next());
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((alert) => alert.textContent)).toEqual([CLEARINGHOUSE_MESSAGE, MVR_MESSAGE]);

    await userEvent.click(checkChip(clearinghouse, "Not yet"));
    await userEvent.click(checkChip(mvr, "None"));
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("compliance", {
        clearinghouseRegistered: false,
        mvrClean3Years: true,
      }),
    );
  });

  it("about you counts characters and saves blank as nothing", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(cdlDriverAt(17)));
    renderFlow("bio", cdlDriverAt(16));
    expect(screen.getByText("0 / 500")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("About you"), "Hello");
    expect(screen.getByText("5 / 500")).toBeInTheDocument();
    await userEvent.click(next());
    await waitFor(() =>
      expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("bio", { bio: "Hello" }),
    );
  });

  it("consent must be ticked, then finishing shows the done screen and refreshes", async () => {
    const complete = buildDriver({ onboardingStep: 18, cardCompleted: true });
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(complete));
    renderFlow("consent", cdlDriverAt(17));
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
    expect(summary.getByText("W-2 employee")).toBeInTheDocument();
    expect(summary.getByText("Local day cab, Regional")).toBeInTheDocument();
    expect(summary.getByText("Dry van, Flatbed · Automatic and manual")).toBeInTheDocument();
    expect(summary.getByText("TWIC, medical card current")).toBeInTheDocument();
    expect(summary.getByText("In the Clearinghouse, no violations in 3 years")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/animate-/);

    await userEvent.click(summary.getByRole("button", { name: "Edit availability" }));
    expect(heading()).toHaveTextContent("When can you work?");
    expect(screen.getByRole("checkbox", { name: /Full time/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("the summary can send the driver back to the record screen", async () => {
    renderFlow("done", buildDriver({ onboardingStep: 18, cardCompleted: true }));
    await userEvent.click(screen.getByRole("button", { name: "Edit record" }));
    expect(heading()).toHaveTextContent("How is your driving record?");
    expect(checkChip(CARD_CHECKS.clearinghouseRegistered.question, "Registered")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows a server error without a matching field as a note", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(failure("Finish the earlier steps first"));
    renderFlow("bio", cdlDriverAt(16));
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
    const mechanic = (overrides: Partial<LocatedDriver>) =>
      ok(buildPartialDriver({ operatorTypes: ["mechanic"], ...overrides }));
    actions.saveOnboardingScreenAction
      .mockResolvedValueOnce(mechanic({ onboardingStep: 5 }))
      .mockResolvedValueOnce(mechanic({ onboardingStep: 8, employmentType: "either" }))
      .mockResolvedValueOnce(
        mechanic({ onboardingStep: 9, employmentType: "either", yearsExperience: 1 }),
      )
      .mockResolvedValueOnce(
        mechanic({
          onboardingStep: 10,
          employmentType: "either",
          yearsExperience: 1,
          availability: ["weekends"],
        }),
      );
    renderFlow("workType", buildPartialDriver({ onboardingStep: 4 }));
    expect(heading()).toHaveTextContent("Work");
    expect(screen.getByText("Mile 2 of 5")).toBeInTheDocument();
    for (const question of [
      "What work do you do?",
      "Do you work W-2 or 1099?",
      "How many years have you done this work?",
      "When can you work?",
    ]) {
      expect(screen.getByText(question)).not.toHaveClass("sr-only");
    }
    // No CDL driving ticked, so the driving and equipment questions stay out of the way.
    expect(screen.queryByText("What kind of driving do you do?")).not.toBeInTheDocument();
    expect(screen.queryByText("What equipment do you run?")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /Mechanic/ }));
    await userEvent.click(screen.getByRole("radio", { name: /Either works/ }));
    await userEvent.click(chip("1 to 2"));
    await userEvent.click(screen.getByRole("checkbox", { name: /Weekends/ }));
    await userEvent.click(next());

    await waitFor(() => expect(actions.saveOnboardingScreenAction).toHaveBeenCalledTimes(4));
    expect(actions.saveOnboardingScreenAction.mock.calls.map((call) => call[0])).toEqual([
      "workType",
      "employmentType",
      "experience",
      "availability",
    ]);
    await waitFor(() => expect(heading()).toHaveTextContent("License"));
  });

  it("shows the driving and equipment questions as soon as CDL driver is ticked", async () => {
    stubDesktop(true);
    renderFlow("workType", buildPartialDriver({ onboardingStep: 4 }));
    const driving = () => screen.queryByText("What kind of driving do you do?");
    expect(driving()).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /CDL driver/ }));
    expect(driving()).toBeInTheDocument();
    expect(screen.getByText("What equipment do you run?")).toBeInTheDocument();
    expect(screen.getByText("Can you drive a manual?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Regional/ }));

    await userEvent.click(screen.getByRole("checkbox", { name: /CDL driver/ }));
    expect(driving()).not.toBeInTheDocument();
    expect(screen.queryByText("Can you drive a manual?")).not.toBeInTheDocument();

    // The answer survives the round trip.
    await userEvent.click(screen.getByRole("checkbox", { name: /CDL driver/ }));
    expect(screen.getByRole("checkbox", { name: /Regional/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("shows the endorsements question as soon as a CDL class is picked, and hides it for No CDL", async () => {
    stubDesktop(true);
    actions.saveOnboardingScreenAction.mockImplementation(async () =>
      ok(buildPartialDriver({ onboardingStep: 14, cdlClass: "A", endorsements: ["H"] })),
    );
    renderFlow("cdlClass", buildPartialDriver({ onboardingStep: 10, operatorTypes: ["mechanic"] }));
    expect(heading()).toHaveTextContent("License");
    expect(screen.queryByText("Any extra letters on your CDL?")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Class A/ }));
    expect(screen.getByText("Any extra letters on your CDL?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /^H\b/ }));

    await userEvent.click(screen.getByRole("radio", { name: /No CDL/ }));
    expect(screen.queryByText("Any extra letters on your CDL?")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Class A/ }));
    expect(screen.getByRole("checkbox", { name: /^H\b/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(checkChip(CARD_CHECKS.twicActive.question, "Yes"));
    await userEvent.click(checkChip(CARD_CHECKS.medicalCardActive.question, "Yes"));
    await userEvent.click(next());

    await waitFor(() => expect(actions.saveOnboardingScreenAction).toHaveBeenCalledTimes(4));
    expect(actions.saveOnboardingScreenAction.mock.calls.map((call) => call[0])).toEqual([
      "cdlClass",
      "endorsements",
      "certifications",
      "credentials",
    ]);
    expect(actions.saveOnboardingScreenAction.mock.calls[1][1]).toEqual({ endorsements: ["H"] });
    expect(actions.saveOnboardingScreenAction.mock.calls[3][1]).toEqual({
      twicActive: true,
      medicalCardActive: true,
    });
  });

  it("saves no endorsements for No CDL on a wide screen", async () => {
    stubDesktop(true);
    actions.saveOnboardingScreenAction.mockImplementation(async () =>
      ok(buildPartialDriver({ onboardingStep: 14, cdlClass: "none" })),
    );
    renderFlow("cdlClass", buildPartialDriver({ onboardingStep: 10, operatorTypes: ["mechanic"] }));
    await userEvent.click(screen.getByRole("radio", { name: /No CDL/ }));
    await userEvent.click(checkChip(CARD_CHECKS.twicActive.question, "No"));
    await userEvent.click(checkChip(CARD_CHECKS.medicalCardActive.question, "No"));
    await userEvent.click(next());
    await waitFor(() => expect(actions.saveOnboardingScreenAction).toHaveBeenCalledTimes(3));
    expect(actions.saveOnboardingScreenAction.mock.calls.map((call) => call[0])).toEqual([
      "cdlClass",
      "certifications",
      "credentials",
    ]);
  });

  it("the Papers page of a CDL driver carries the record questions, and its button says Next", async () => {
    stubDesktop(true);
    actions.saveOnboardingScreenAction.mockImplementation(async () =>
      ok(cdlDriverAt(16, { cdlClass: "A" })),
    );
    renderFlow("documents", cdlDriverAt(14, { cdlClass: "A" }));
    expect(heading()).toHaveTextContent("Papers");
    expect(screen.getByText("How is your driving record?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip for now" })).not.toBeInTheDocument();
    await userEvent.click(checkChip(CARD_CHECKS.clearinghouseRegistered.question, "Registered"));
    await userEvent.click(checkChip(CARD_CHECKS.mvrClean3Years.question, "One or more"));
    await userEvent.click(next());
    await waitFor(() => expect(actions.saveOnboardingScreenAction).toHaveBeenCalledTimes(2));
    expect(actions.saveOnboardingScreenAction.mock.calls.map((call) => call[0])).toEqual([
      "documents",
      "compliance",
    ]);
    expect(actions.saveOnboardingScreenAction.mock.calls[1][1]).toEqual({
      clearinghouseRegistered: true,
      mvrClean3Years: false,
    });
  });

  it("the Papers page of a mechanic has no record questions and can be skipped", () => {
    stubDesktop(true);
    renderFlow(
      "documents",
      buildPartialDriver({ onboardingStep: 14, operatorTypes: ["mechanic"], cdlClass: "none" }),
    );
    expect(screen.queryByText("How is your driving record?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
  });

  it("stops at the first screen with an error", async () => {
    stubDesktop(true);
    renderFlow("workType", buildPartialDriver({ onboardingStep: 4 }));
    await userEvent.click(chip("Under 1"));
    await userEvent.click(next());
    expect(await screen.findByText("Pick at least one kind of work")).toBeInTheDocument();
    expect(screen.getByText(EMPLOYMENT_MESSAGE)).toBeInTheDocument();
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
    expect(fill.style.width).toBe("6%");
    expect(truck.style.left).toBe("6%");
  });
});

describe("resume", () => {
  it("opens on the step the server reports with the saved answers", async () => {
    renderFlow("experience", cdlDriverAt(8, { yearsExperience: 8 }));
    expect(heading()).toHaveTextContent("How many years have you done this work?");
    expect(chip("6 to 10")).toHaveAttribute("aria-pressed", "true");
    await act(async () => undefined);
  });
});
