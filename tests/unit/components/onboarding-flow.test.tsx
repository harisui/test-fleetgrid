import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "@/components/driver/OnboardingFlow";
import { SMS_CONSENT_TEXT } from "@/lib/constants";
import { CARD_CHECKS, MVR_HELPER, MVR_QUESTION } from "@/lib/onboarding/options";
import { MILES, STEPS, stepsOfMile, type StepId } from "@/lib/onboarding/steps";
import {
  CDL_CLASS_MESSAGE,
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
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/driver.actions", () => actions);
vi.mock("sonner", () => ({ toast }));

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
/** The chip of one question, found through the question's group. */
const checkChip = (question: string, name: string) =>
  within(screen.getByRole("group", { name: question })).getByRole("button", { name });
const alerts = () => screen.getAllByRole("alert").map((alert) => alert.textContent);
/** The driver's screen names that were saved, in order. */
const savedScreens = () => actions.saveOnboardingScreenAction.mock.calls.map((call) => call[0]);
/** A card part-way through the flow, about to see `onboardingStep`. */
const driverAt = (onboardingStep: number, overrides: Partial<LocatedDriver> = {}) =>
  buildPartialDriver({ onboardingStep, ...overrides });
/** A complete card with every sign-up answer, shown again at `onboardingStep`. */
const answeredAt = (onboardingStep: number) =>
  buildDriver({ onboardingStep, cardCompleted: false, smsOptIn: false });

function renderFlow(stepId: StepId, driver: LocatedDriver | null = buildPartialDriver()) {
  return render(<OnboardingFlow initialStepId={stepId} initialDriver={driver} phone={PHONE} />);
}

/** A page of the given height in a 800px viewport, scrolled to the top. */
function stubPageHeight(height: number) {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 800 });
  Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 });
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.lookupZipAction.mockResolvedValue(ok(null));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("one page per mile, on every device", () => {
  it.each(MILES.filter((mile) => mile.mile < MILES.length).map((mile) => [mile.label, mile.mile] as const))(
    "the %s page shows every question of the mile under one sign, with no app navigation",
    (label, mile) => {
      const steps = stepsOfMile(mile);
      renderFlow(steps[0].id, driverAt(12, { cdlClass: "A" }));
      expect(heading()).toHaveTextContent(label);
      expect(screen.getByText(`Mile ${mile} of ${MILES.length}`)).toBeInTheDocument();
      for (const step of steps) {
        expect(screen.getByText(step.question)).not.toHaveClass("sr-only");
      }
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(document.querySelectorAll("[aria-invalid='true']")).toHaveLength(0);
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
      expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute(
        "aria-valuetext",
        `Step ${mile} of ${MILES.length}: ${label}`,
      );
    },
  );

  it("never asks work type, W-2 or 1099, driving style, availability, certifications, papers or about you", () => {
    for (const step of STEPS) {
      if (step.id === "done") continue;
      renderFlow(step.id, driverAt(12, { cdlClass: "A" }));
    }
    for (const gone of [
      "What work do you do?",
      "Do you work W-2 or 1099?",
      "What kind of driving do you do?",
      "When can you work?",
      "Do you have any certifications?",
      "Take a photo",
      "Skip for now",
      "About you",
      "FMCSA Clearinghouse",
    ]) {
      expect(screen.queryByText(new RegExp(gone)), gone).not.toBeInTheDocument();
    }
  });

  it("the About page has no Back; later pages do", () => {
    renderFlow("name", null);
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("shows Saved on a page that was already answered", () => {
    renderFlow("name", driverAt(4, { zip: "75201", city: "Dallas", state: "TX" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(place()).toHaveTextContent("Dallas, TX");
  });

  it("shows the scroll hint only while the page runs past the fold", () => {
    const hint = () => screen.queryByRole("button", { name: "Scroll down for more" });
    stubPageHeight(2000);
    const tall = renderFlow("cdlClass", driverAt(4));
    expect(hint()).toBeInTheDocument();
    tall.unmount();

    stubPageHeight(600);
    renderFlow("credentials", driverAt(7));
    expect(hint()).not.toBeInTheDocument();
  });
});

describe("About page: name, ZIP, distance", () => {
  const dataset = () =>
    actions.lookupZipAction.mockImplementation(async (zip: string) =>
      ok(
        zip === "75201"
          ? { zip, city: "Dallas", state: "TX", inServiceArea: false }
          : zip === "77002"
            ? { zip, city: "Houston", state: "TX", inServiceArea: true }
            : null,
      ),
    );

  it("validates every question after Next, then saves them in order and moves to the CDL page", async () => {
    dataset();
    actions.saveOnboardingScreenAction
      .mockResolvedValueOnce(ok(driverAt(2, { fullName: "Pat Driver" })))
      .mockResolvedValueOnce(ok(driverAt(3, { fullName: "Pat Driver", zip: "77002" })))
      .mockResolvedValueOnce(ok(driverAt(4, { fullName: "Pat Driver", zip: "77002" })));
    renderFlow("name", null);
    const name = screen.getByLabelText("Full name");
    await userEvent.type(name, "P");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.click(next());
    await waitFor(() => expect(alerts()).toHaveLength(3));
    expect(alerts()).toEqual([
      "Enter your name",
      "Enter a 5-digit ZIP code, like 60601",
      "Pick how far you will travel",
    ]);
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(actions.saveOnboardingScreenAction).not.toHaveBeenCalled();

    await userEvent.type(name, "at Driver");
    await userEvent.type(screen.getByLabelText("ZIP code"), "77002");
    await waitFor(() => expect(place()).toHaveTextContent("Houston, TX"));
    await userEvent.click(chip("100 miles"));
    await userEvent.click(next());
    await waitFor(() => expect(heading()).toHaveTextContent("CDL"));
    expect(savedScreens()).toEqual(["name", "zip", "distance"]);
    expect(actions.saveOnboardingScreenAction.mock.calls.map((call) => call[1])).toEqual([
      { fullName: "Pat Driver" },
      { zip: "77002" },
      { serviceRadiusMiles: 100 },
    ]);
    expect(heading()).toHaveFocus();
  });

  it("tells a driver outside the launch area so, as information, and keeps going", async () => {
    dataset();
    renderFlow("name", null);
    const note = () => document.querySelector("[data-slot=launch-area-note]");

    await userEvent.type(screen.getByLabelText("ZIP code"), "75201");
    await waitFor(() => expect(place()).toHaveTextContent("Dallas, TX"));
    expect(note()).toHaveTextContent(
      "FleetGrid is launching in the Houston area first. You can still sign up. We'll text you when we launch near you.",
    );
    expect(note()).toHaveAttribute("data-variant", "info");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-invalid='true']")).toBeNull();
    // Next is held only until the dataset's answer reaches the form, a tick after the line shows.
    await waitFor(() => expect(next()).toBeEnabled());

    await userEvent.clear(screen.getByLabelText("ZIP code"));
    await userEvent.type(screen.getByLabelText("ZIP code"), "77002");
    await waitFor(() => expect(place()).toHaveTextContent("Houston, TX"));
    expect(note()).toBeNull();
  });

  it("shows the city and state from the ZIP as one read-only line, never as fields", async () => {
    actions.lookupZipAction.mockResolvedValue(
      ok({ zip: "60601", city: "Chicago", state: "IL", inServiceArea: true }),
    );
    renderFlow("name", null);
    expect(place()).toBeNull();
    await userEvent.type(screen.getByLabelText("ZIP code"), "60601");

    await waitFor(() => expect(place()).toHaveTextContent("Chicago, IL"));
    expect(screen.queryByLabelText("City")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "State" })).not.toBeInTheDocument();
    expect(screen.getByText(/City and state filled in from your ZIP/)).toBeInTheDocument();
    expect(document.querySelector("[data-slot=field-success]")).not.toBeNull();
    expect(actions.lookupZipAction).toHaveBeenCalledWith("60601");
  });

  it("stops on a ZIP the dataset does not know, and lets go once a known one is typed", async () => {
    dataset();
    renderFlow("name", null);
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
    await userEvent.type(field, "77002");
    await waitFor(() => expect(place()).toHaveTextContent("Houston, TX"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(next()).toBeEnabled());
  });

  it("shows the server's answer when it rejects the ZIP, and stops there", async () => {
    dataset();
    actions.saveOnboardingScreenAction
      .mockResolvedValueOnce(ok(driverAt(2, { fullName: "Pat Driver" })))
      .mockResolvedValueOnce(
        failure("Check the form", { zip: "We could not find that ZIP. Check the number." }),
      );
    renderFlow("name", null);
    await userEvent.type(screen.getByLabelText("Full name"), "Pat Driver");
    await userEvent.type(screen.getByLabelText("ZIP code"), "77002");
    await waitFor(() => expect(place()).toHaveTextContent("Houston, TX"));
    await userEvent.click(chip("50 miles"));
    await userEvent.click(next());
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not find that ZIP");
    expect(heading()).toHaveTextContent("About");
    expect(savedScreens()).toEqual(["name", "zip"]);
  });

  it("Back from the CDL page returns to the About page with the saved answers", async () => {
    renderFlow(
      "cdlClass",
      driverAt(4, { fullName: "Pat Driver", zip: "77002", city: "Houston", state: "TX" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(heading()).toHaveTextContent("About");
    expect(screen.getByLabelText("Full name")).toHaveValue("Pat Driver");
    expect(place()).toHaveTextContent("Houston, TX");
    expect(chip("50 miles")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("CDL page: class, years, record", () => {
  it("offers Class A, B and C only, with no No CDL card", () => {
    renderFlow("cdlClass", driverAt(4));
    const classes = within(screen.getByRole("radiogroup", { name: "What class is your CDL?" }));
    expect(classes.getAllByRole("radio")).toHaveLength(3);
    for (const name of ["Class A", "Class B", "Class C"]) {
      expect(classes.getByRole("radio", { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(screen.queryByText(/No CDL/)).not.toBeInTheDocument();
  });

  it("every question is required, then the three screens save in order and the Cards page follows", async () => {
    actions.saveOnboardingScreenAction
      .mockResolvedValueOnce(ok(driverAt(5, { cdlClass: "A" })))
      .mockResolvedValueOnce(ok(driverAt(6, { cdlClass: "A", yearsExperience: 3 })))
      .mockResolvedValueOnce(
        ok(driverAt(7, { cdlClass: "A", yearsExperience: 3, mvrStatus: "minor_1_2" })),
      );
    renderFlow("cdlClass", driverAt(4));
    expect(screen.getByText(MVR_HELPER)).toBeInTheDocument();
    expect(screen.queryByLabelText("Exact number (optional)")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: MVR_QUESTION }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["None", "1 or 2 minor", "3 or more, or a major one"]);

    await userEvent.click(next());
    await waitFor(() => expect(alerts()).toHaveLength(3));
    expect(alerts()).toEqual([CDL_CLASS_MESSAGE, "Pick how many years you have driven", MVR_MESSAGE]);
    expect(actions.saveOnboardingScreenAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("radio", { name: /Class A/ }));
    await userEvent.click(chip("3 to 5"));
    expect(chip("3 to 5")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(checkChip(MVR_QUESTION, "1 or 2 minor"));
    // One level at a time: picking another replaces it.
    await userEvent.click(checkChip(MVR_QUESTION, "None"));
    expect(checkChip(MVR_QUESTION, "1 or 2 minor")).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(checkChip(MVR_QUESTION, "1 or 2 minor"));
    await userEvent.click(next());

    await waitFor(() => expect(heading()).toHaveTextContent("Cards"));
    expect(savedScreens()).toEqual(["cdlClass", "experience", "record"]);
    expect(actions.saveOnboardingScreenAction.mock.calls.map((call) => call[1])).toEqual([
      { cdlClass: "A" },
      { yearsExperience: 3 },
      { mvrStatus: "minor_1_2" },
    ]);
  });

  it("stops at the first screen with an error and saves nothing", async () => {
    renderFlow("cdlClass", driverAt(4));
    await userEvent.click(chip("Under 1"));
    await userEvent.click(next());
    expect(await screen.findByText(CDL_CLASS_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(MVR_MESSAGE)).toBeInTheDocument();
    expect(actions.saveOnboardingScreenAction).not.toHaveBeenCalled();
  });

  it("stops on the screen the server rejects, and leaves the later ones unsaved", async () => {
    actions.saveOnboardingScreenAction
      .mockResolvedValueOnce(ok(driverAt(5, { cdlClass: "A" })))
      .mockResolvedValueOnce(failure("Check the form", { yearsExperience: "Too many" }));
    renderFlow("cdlClass", driverAt(4));
    await userEvent.click(screen.getByRole("radio", { name: /Class A/ }));
    await userEvent.click(chip("10 or more"));
    await userEvent.click(checkChip(MVR_QUESTION, "None"));
    await userEvent.click(next());
    expect(await screen.findByText("Too many")).toBeInTheDocument();
    expect(heading()).toHaveTextContent("CDL");
    expect(savedScreens()).toEqual(["cdlClass", "experience"]);
  });
});

describe("Cards page", () => {
  it("asks TWIC and medical card as two yes-or-no questions, both required", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(driverAt(8, { twicActive: true, medicalCardActive: false })),
    );
    renderFlow("credentials", driverAt(7));
    const twic = CARD_CHECKS.twicActive.question;
    const medical = CARD_CHECKS.medicalCardActive.question;
    expect(screen.getByText("Carriers ask for both. You can update these any time.")).toBeInTheDocument();
    await userEvent.click(next());
    await waitFor(() => expect(alerts()).toEqual([TWIC_MESSAGE, MEDICAL_CARD_MESSAGE]));

    await userEvent.click(checkChip(twic, "Yes"));
    await userEvent.click(checkChip(medical, "No"));
    expect(checkChip(twic, "Yes")).toHaveAttribute("aria-pressed", "true");
    expect(checkChip(medical, "No")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(next());
    await waitFor(() => expect(heading()).toHaveTextContent("Letters"));
    expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("credentials", {
      twicActive: true,
      medicalCardActive: false,
    });
  });

  it("shows saved answers as pressed chips", () => {
    renderFlow("credentials", driverAt(8, { twicActive: false, medicalCardActive: true }));
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

describe("Letters page: endorsements and transmission", () => {
  it("X picks H and N with a note, dropping N drops X, None clears everything, and the transmission is required", async () => {
    actions.saveOnboardingScreenAction
      .mockResolvedValueOnce(ok(driverAt(9, { cdlClass: "A", endorsements: ["T"] })))
      .mockResolvedValueOnce(
        ok(driverAt(10, { cdlClass: "A", endorsements: ["T"], transmission: "automatic_only" })),
      );
    renderFlow("endorsements", driverAt(8, { cdlClass: "A" }));
    expect(screen.getByRole("img", { name: /front of a CDL/ })).toBeInTheDocument();
    expect(screen.getByText(/These are called endorsements/)).toBeInTheDocument();
    expect(screen.getByText("Can you drive a manual?")).toBeInTheDocument();

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

    await userEvent.click(screen.getByRole("checkbox", { name: /^None/ }));
    expect(screen.getByRole("checkbox", { name: /^None/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: /^H\b/ })).toHaveAttribute("aria-checked", "false");

    await userEvent.click(screen.getByRole("checkbox", { name: /^T\b/ }));
    expect(screen.getByRole("checkbox", { name: /^None/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    // No endorsements is fine; the transmission is not optional.
    await userEvent.click(next());
    await waitFor(() => expect(alerts()).toEqual([TRANSMISSION_MESSAGE]));
    expect(actions.saveOnboardingScreenAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("radio", { name: /Automatic only/ }));
    await userEvent.click(next());
    await waitFor(() => expect(heading()).toHaveTextContent("Equipment"));
    expect(savedScreens()).toEqual(["endorsements", "transmission"]);
    expect(actions.saveOnboardingScreenAction.mock.calls.map((call) => call[1])).toEqual([
      { endorsements: ["T"] },
      { transmission: "automatic_only" },
    ]);
  });
});

describe("Equipment page", () => {
  it("chips, at least one, then the Finish page follows", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      ok(driverAt(11, { equipmentTypes: ["dry_van", "reefer"] })),
    );
    renderFlow("equipment", driverAt(10));
    expect(screen.getByText("Pick everything you have pulled or driven.")).toBeInTheDocument();
    await userEvent.click(next());
    await waitFor(() => expect(alerts()).toEqual([EQUIPMENT_MESSAGE]));

    await userEvent.click(chip("Dry van"));
    await userEvent.click(chip("Reefer"));
    await userEvent.click(next());
    await waitFor(() => expect(heading()).toHaveTextContent("Finish"));
    expect(actions.saveOnboardingScreenAction).toHaveBeenCalledWith("equipment", {
      equipmentTypes: ["dry_van", "reefer"],
    });
  });
});

describe("Finish page: consent and done", () => {
  it("consent must be ticked, then Find local shifts shows the done screen and refreshes", async () => {
    const complete = buildDriver({ onboardingStep: 12, cardCompleted: true });
    actions.saveOnboardingScreenAction.mockResolvedValue(ok(complete));
    renderFlow("consent", answeredAt(11));
    expect(
      screen.getByText(/Shift offers come by text to \(\*\*\*\) \*\*\*-0100/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    const finish = screen.getByRole("button", { name: "Find local shifts" });
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
    expect(summary.getByText("6 to 10 years")).toBeInTheDocument();
    expect(summary.getByText("No violations in 3 years")).toBeInTheDocument();
    expect(summary.getByText("TWIC, medical card current")).toBeInTheDocument();
    expect(summary.getByText("H, T")).toBeInTheDocument();
    expect(summary.getByText("Automatic and manual")).toBeInTheDocument();
    expect(summary.getByText("Dry van, Flatbed")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/animate-/);

    await userEvent.click(summary.getByRole("button", { name: "Edit equipment" }));
    expect(heading()).toHaveTextContent("Equipment");
    expect(chip("Dry van")).toHaveAttribute("aria-pressed", "true");
  });

  it("the summary can send the driver back to the CDL page, with the record shown", async () => {
    renderFlow("done", buildDriver({ onboardingStep: 12, cardCompleted: true }));
    await userEvent.click(screen.getByRole("button", { name: "Edit record" }));
    expect(heading()).toHaveTextContent("CDL");
    expect(checkChip(MVR_QUESTION, "None")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: /Class A/ })).toHaveAttribute("aria-checked", "true");
  });

  it("shows a server error without a matching field as a note", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(failure("Finish the earlier steps first"));
    renderFlow("equipment", answeredAt(10));
    await userEvent.click(next());
    expect(await screen.findByRole("alert")).toHaveTextContent("Finish the earlier steps first");
    expect(heading()).toHaveTextContent("Equipment");
  });

  it("maps a server field error onto its field", async () => {
    actions.saveOnboardingScreenAction.mockResolvedValue(
      failure("Check the form", { fullName: "Too short" }),
    );
    actions.lookupZipAction.mockResolvedValue(
      ok({ zip: "75201", city: "Dallas", state: "TX", inServiceArea: true }),
    );
    renderFlow(
      "name",
      driverAt(4, { fullName: "Pat Driver", zip: "75201", city: "Dallas", state: "TX" }),
    );
    await waitFor(() => expect(next()).toBeEnabled());
    await userEvent.click(next());
    expect(await screen.findByText("Too short")).toBeInTheDocument();
  });
});

describe("the road", () => {
  it("stays mounted from one page to the next, so the fill and truck can animate", async () => {
    actions.lookupZipAction.mockResolvedValue(
      ok({ zip: "77002", city: "Houston", state: "TX", inServiceArea: true }),
    );
    actions.saveOnboardingScreenAction
      .mockResolvedValueOnce(ok(driverAt(2, { fullName: "Pat Driver" })))
      .mockResolvedValueOnce(ok(driverAt(3, { fullName: "Pat Driver", zip: "77002" })))
      .mockResolvedValueOnce(ok(driverAt(4, { fullName: "Pat Driver", zip: "77002" })));
    const { container } = renderFlow("name", null);
    const fill = container.querySelector("[data-slot=lane-fill]") as HTMLElement;
    const truck = container.querySelector("[data-slot=lane-truck]") as HTMLElement;
    expect(fill.style.width).toBe("0%");

    await userEvent.type(screen.getByLabelText("Full name"), "Pat Driver");
    await userEvent.type(screen.getByLabelText("ZIP code"), "77002");
    await waitFor(() => expect(place()).toHaveTextContent("Houston, TX"));
    await userEvent.click(chip("25 miles"));
    await userEvent.click(next());
    await waitFor(() => expect(heading()).toHaveTextContent("CDL"));

    expect(container.querySelector("[data-slot=lane-fill]")).toBe(fill);
    expect(container.querySelector("[data-slot=lane-truck]")).toBe(truck);
    expect(fill.style.width).toBe("27%");
    expect(truck.style.left).toBe("27%");
  });
});

describe("resume", () => {
  it("opens on the page the server reports with the saved answers", async () => {
    renderFlow("experience", driverAt(5, { cdlClass: "B", yearsExperience: 8 }));
    expect(heading()).toHaveTextContent("CDL");
    expect(screen.getByRole("radio", { name: /Class B/ })).toHaveAttribute("aria-checked", "true");
    expect(chip("6 to 10")).toHaveAttribute("aria-pressed", "true");
    await act(async () => undefined);
  });
});
