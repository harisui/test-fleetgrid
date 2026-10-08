import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStatusCard } from "@/components/driver/AccountStatusCard";
import { ProfileEditor } from "@/components/driver/ProfileEditor";
import { CARD_CHECKS } from "@/lib/onboarding/options";
import {
  CLEARINGHOUSE_MESSAGE,
  DRIVING_STYLE_MESSAGE,
  EQUIPMENT_MESSAGE,
  MVR_MESSAGE,
  TRANSMISSION_MESSAGE,
} from "@/lib/validation/onboarding.schema";
import type { Result } from "@/server/errors/AppError";
import { buildDriver, buildProfile } from "../../setup/factories";

const actions = vi.hoisted(() => ({
  saveOnboardingScreenAction: vi.fn(),
  updateCardAction: vi.fn(),
  lookupZipAction: vi.fn(),
}));

/** The dataset as the profile sees it: Dallas, Chicago and nothing else. */
const PLACES: Record<string, { city: string; state: string }> = {
  "75201": { city: "Dallas", state: "TX" },
  "60601": { city: "Chicago", state: "IL" },
};
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/server/actions/driver.actions", () => actions);
vi.mock("sonner", () => ({ toast }));

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const failure = (message: string, fieldErrors?: Record<string, string>): Result<never> => ({
  ok: false,
  error: { code: "VALIDATION", message, fieldErrors },
});

beforeEach(() => {
  vi.clearAllMocks();
  actions.lookupZipAction.mockImplementation(async (zip: string) =>
    ok(PLACES[zip] ? { zip, ...PLACES[zip], inServiceArea: false } : null),
  );
});

describe("AccountStatusCard", () => {
  const card = () => screen.getByRole("region", { name: "Account status" });

  it.each([
    ["pending", "Pending review", /reviewing your profile/],
    ["approved", "Approved", /Matching shift offers will be texted/],
    ["blocked", "Blocked", /Contact support/],
  ] as const)("explains the %s status", (status, label, help) => {
    render(<AccountStatusCard profile={buildProfile({ status })} driver={buildDriver()} />);
    expect(within(card()).getByText(label)).toHaveAttribute("data-status", status);
    expect(within(card()).getByText(help)).toBeInTheDocument();
  });

  it("shows the phone number that receives offers", () => {
    render(
      <AccountStatusCard
        profile={buildProfile({ phone: "+15555550100" })}
        driver={buildDriver()}
      />,
    );
    expect(screen.getByText("(555) 555-0100")).toBeInTheDocument();
  });

  it("shows Subscribed when opted in and not opted out", () => {
    render(<AccountStatusCard profile={buildProfile()} driver={buildDriver()} />);
    expect(screen.getByText("Subscribed")).toHaveAttribute("data-sms", "subscribed");
    expect(screen.queryByText(/START/)).not.toBeInTheDocument();
  });

  it("explains how to re-subscribe after opting out", () => {
    render(
      <AccountStatusCard profile={buildProfile()} driver={buildDriver({ smsOptedOut: true })} />,
    );
    expect(screen.getByText("Opted out")).toHaveAttribute("data-sms", "off");
    expect(screen.getByText(/You replied STOP/)).toBeInTheDocument();
    expect(screen.getByText("START")).toBeInTheDocument();
    expect(screen.queryByText("Subscribed")).not.toBeInTheDocument();
  });

  it("marks a driver outside the launch area, with one sentence saying what it means", () => {
    render(
      <AccountStatusCard profile={buildProfile()} driver={buildDriver({ inServiceArea: false })} />,
    );
    const badge = within(card()).getByText("Outside launch area");
    expect(badge).toHaveAttribute("data-area", "outside");
    expect(badge).toHaveAttribute("data-variant", "info");
    expect(
      within(card()).getByText(
        "FleetGrid is launching in the Houston area first. We'll text you when we launch near you.",
      ),
    ).toHaveAttribute("data-slot", "launch-area-help");
    // The account status itself is unchanged.
    expect(within(card()).getByText("Pending review")).toBeInTheDocument();
  });

  it.each([
    ["inside the area", true],
    ["without coordinates", null],
  ] as const)("shows no launch-area badge for a driver %s", (_label, inServiceArea) => {
    render(<AccountStatusCard profile={buildProfile()} driver={buildDriver({ inServiceArea })} />);
    expect(within(card()).queryByText("Outside launch area")).not.toBeInTheDocument();
    expect(document.querySelector("[data-slot=launch-area-help]")).toBeNull();
  });

  it("shows Not subscribed when consent was never given", () => {
    render(
      <AccountStatusCard profile={buildProfile()} driver={buildDriver({ smsOptIn: false })} />,
    );
    expect(screen.getByText("Not subscribed")).toBeInTheDocument();
    expect(screen.queryByText(/You replied STOP/)).not.toBeInTheDocument();
  });
});

describe("ProfileEditor", () => {
  const save = () => screen.getByRole("button", { name: "Save changes" });
  const group = (name: string) => within(screen.getByRole("group", { name }));
  const checkRadio = (question: string, name: string) =>
    group(question).getByRole("radio", { name });

  it("is prefilled with every card field", () => {
    render(<ProfileEditor driver={buildDriver({ serviceRadiusMiles: 120 })} />);
    expect(screen.getByLabelText(/Full name/)).toHaveValue("Pat Driver");
    // City and state are one read-only line from the dataset, not fields.
    expect(document.querySelector("[data-slot=zip-place]")).toHaveTextContent("Dallas, TX");
    expect(screen.queryByLabelText("City")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /State/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/ZIP code/)).toHaveValue("75201");
    expect(screen.getByLabelText(/Service radius/)).toHaveValue(120);
    expect(screen.getByRole("checkbox", { name: "CDL driver" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "W-2 employee" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Class A" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^H -/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "6 to 10" })).toBeChecked();
    expect(screen.getByText("OSHA 10")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Local day cab" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Regional" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Dry van" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Flatbed" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Automatic and manual" })).toBeChecked();
    expect(checkRadio(CARD_CHECKS.twicActive.question, "Yes")).toBeChecked();
    expect(checkRadio(CARD_CHECKS.medicalCardActive.question, "Yes")).toBeChecked();
    expect(checkRadio(CARD_CHECKS.clearinghouseRegistered.question, "Registered")).toBeChecked();
    expect(checkRadio(CARD_CHECKS.mvrClean3Years.question, "None")).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Full time" })).toBeChecked();
    expect(screen.getByLabelText("About you")).toHaveValue("Reliable and on time.");
  });

  it("describes each CDL class in the onboarding words, with the label as the name", () => {
    render(<ProfileEditor driver={buildDriver()} />);
    const group = screen.getByRole("group", { name: /CDL class/ });
    expect(within(group).getByText("Tractor-trailers and big rigs")).toBeInTheDocument();
    expect(within(group).getByText("Straight trucks, buses, dump trucks")).toBeInTheDocument();
    expect(
      within(group).getByText("Passenger vans (16+) and small hazmat vehicles"),
    ).toBeInTheDocument();
    expect(within(group).getByText("Fine for yard and shop work")).toBeInTheDocument();
    const classC = within(group).getByRole("radio", { name: "Class C" });
    expect(classC).toHaveAccessibleDescription("Passenger vans (16+) and small hazmat vehicles");
  });

  it("shows the years as the same five ranges as onboarding, no number field", () => {
    render(<ProfileEditor driver={buildDriver({ yearsExperience: 9 })} />);
    expect(screen.queryByLabelText(/Years of experience/)).not.toBeInTheDocument();
    const years = screen.getByRole("group", { name: /Years of experience/ });
    expect(
      within(years)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["0", "1", "3", "6", "10"]);
    // A card saved under the old flow with an exact number shows its range.
    expect(within(years).getByRole("radio", { name: "6 to 10" })).toBeChecked();
  });

  it("groups the fields into four labelled sections", () => {
    render(<ProfileEditor driver={buildDriver()} />);
    for (const name of ["Basics", "Role and licenses", "Equipment and checks", "Availability"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
  });

  it("handles a card with empty optional fields", () => {
    render(<ProfileEditor driver={buildDriver({ city: null, bio: null })} />);
    expect(screen.getByLabelText("About you")).toHaveValue("");
    expect(screen.getByText("0/500")).toBeInTheDocument();
  });

  it("follows a new ZIP with the dataset's city and state, and stops on an unknown one", async () => {
    render(<ProfileEditor driver={buildDriver()} />);
    const zip = screen.getByLabelText(/ZIP code/);
    await userEvent.clear(zip);
    await userEvent.type(zip, "60601");
    await waitFor(() =>
      expect(document.querySelector("[data-slot=zip-place]")).toHaveTextContent("Chicago, IL"),
    );
    expect(actions.lookupZipAction).toHaveBeenCalledWith("60601");

    await userEvent.clear(zip);
    await userEvent.type(zip, "99999");
    expect(
      await screen.findByText("We could not find that ZIP. Check the number."),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-slot=zip-place]")).toBeNull();
  });

  it("saves edited values and confirms with a toast", async () => {
    actions.updateCardAction.mockResolvedValue(ok(buildDriver()));
    render(<ProfileEditor driver={buildDriver()} />);

    await userEvent.clear(screen.getByLabelText(/ZIP code/));
    await userEvent.type(screen.getByLabelText(/ZIP code/), "60601");
    await userEvent.click(screen.getByText("Mechanic"));
    await userEvent.click(screen.getByText("Either works"));
    await userEvent.click(screen.getByText("Weekends"));
    await userEvent.click(screen.getByText("10 or more"));
    await userEvent.click(screen.getByText("OTR (over the road)"));
    await userEvent.click(screen.getByText("Reefer"));
    await userEvent.click(screen.getByText("Automatic only"));
    await userEvent.click(checkRadio(CARD_CHECKS.twicActive.question, "No"));
    await userEvent.click(checkRadio(CARD_CHECKS.mvrClean3Years.question, "One or more"));
    await userEvent.click(save());

    await waitFor(() =>
      expect(actions.updateCardAction).toHaveBeenCalledWith({
        fullName: "Pat Driver",
        zip: "60601",
        serviceRadiusMiles: 50,
        operatorTypes: ["cdl_driver", "mechanic"],
        employmentType: "either",
        cdlClass: "A",
        endorsements: ["H", "T"],
        yearsExperience: 10,
        certifications: ["OSHA 10"],
        drivingStyles: ["local_day_cab", "regional", "otr"],
        transmission: "automatic_only",
        equipmentTypes: ["dry_van", "flatbed", "reefer"],
        twicActive: false,
        medicalCardActive: true,
        clearinghouseRegistered: true,
        mvrClean3Years: false,
        availability: ["full_time", "weekends"],
        bio: "Reliable and on time.",
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Profile saved"));
  });

  it("hides endorsements and clears them when switching to No CDL", async () => {
    actions.updateCardAction.mockResolvedValue(ok(buildDriver()));
    render(<ProfileEditor driver={buildDriver()} />);
    await userEvent.click(screen.getByText("No CDL"));
    expect(screen.queryByRole("group", { name: "Endorsements" })).not.toBeInTheDocument();
    await userEvent.click(save());

    await waitFor(() =>
      expect(actions.updateCardAction).toHaveBeenCalledWith(
        expect.objectContaining({ cdlClass: "none", endorsements: [] }),
      ),
    );
  });

  it("hides the driving, equipment and record questions when the work has no CDL driving", async () => {
    render(<ProfileEditor driver={buildDriver()} />);
    const driving = () => screen.queryByRole("group", { name: /What kind of driving/ });
    expect(driving()).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "CDL driver" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Mechanic" }));
    expect(driving()).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /What equipment/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Can you drive a manual/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: CARD_CHECKS.clearinghouseRegistered.question }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: CARD_CHECKS.mvrClean3Years.question }),
    ).not.toBeInTheDocument();
    // Everyone answers TWIC and the medical card.
    expect(
      screen.getByRole("group", { name: CARD_CHECKS.twicActive.question }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: CARD_CHECKS.medicalCardActive.question }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "CDL driver" }));
    expect(driving()).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Regional" })).toBeChecked();
  });

  it("requires the driving, equipment and record answers of a CDL driver", async () => {
    render(
      <ProfileEditor
        driver={buildDriver({
          drivingStyles: [],
          transmission: null,
          equipmentTypes: [],
          clearinghouseRegistered: null,
          mvrClean3Years: null,
        })}
      />,
    );
    await userEvent.click(save());
    for (const message of [
      DRIVING_STYLE_MESSAGE,
      TRANSMISSION_MESSAGE,
      EQUIPMENT_MESSAGE,
      CLEARINGHOUSE_MESSAGE,
      MVR_MESSAGE,
    ]) {
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
    expect(actions.updateCardAction).not.toHaveBeenCalled();
  });

  it("validates before saving", async () => {
    render(<ProfileEditor driver={buildDriver()} />);
    await userEvent.clear(screen.getByLabelText(/Full name/));
    await userEvent.clear(screen.getByLabelText(/ZIP code/));
    await userEvent.type(screen.getByLabelText(/ZIP code/), "123");
    await userEvent.click(screen.getByText("Full time"));
    await userEvent.click(save());

    expect(await screen.findByText("Enter your full name")).toBeInTheDocument();
    expect(screen.getByText("Enter a 5-digit ZIP code")).toBeInTheDocument();
    expect(screen.getByText("Select at least one option")).toBeInTheDocument();
    expect(actions.updateCardAction).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows server field errors and no success toast", async () => {
    actions.updateCardAction.mockResolvedValue(
      failure("Check the form", { zip: "We could not find that ZIP. Check the number." }),
    );
    render(<ProfileEditor driver={buildDriver()} />);
    await userEvent.click(save());

    expect(
      await screen.findByText("We could not find that ZIP. Check the number."),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows a general server error", async () => {
    actions.updateCardAction.mockResolvedValue(failure("Your account has been blocked."));
    render(<ProfileEditor driver={buildDriver()} />);
    await userEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Your account has been blocked.");
  });
});
