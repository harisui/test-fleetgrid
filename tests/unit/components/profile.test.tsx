import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStatusCard } from "@/components/driver/AccountStatusCard";
import { ProfileEditor } from "@/components/driver/ProfileEditor";
import type { Result } from "@/server/errors/AppError";
import { buildDriver, buildProfile } from "../../setup/factories";

const actions = vi.hoisted(() => ({
  saveOnboardingScreenAction: vi.fn(),
  updateCardAction: vi.fn(),
}));
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

  it("is prefilled with every card field", () => {
    render(<ProfileEditor driver={buildDriver({ serviceRadiusMiles: 120 })} />);
    expect(screen.getByLabelText(/Full name/)).toHaveValue("Pat Driver");
    expect(screen.getByLabelText("City")).toHaveValue("Dallas");
    expect(screen.getByRole("combobox", { name: /State/ })).toHaveTextContent("Texas");
    expect(screen.getByLabelText(/ZIP code/)).toHaveValue("75201");
    expect(screen.getByLabelText(/Service radius/)).toHaveValue(120);
    expect(screen.getByRole("checkbox", { name: "CDL driver" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Class A" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^H -/ })).toBeChecked();
    expect(screen.getByLabelText(/Years of experience/)).toHaveValue(8);
    expect(screen.getByText("TWIC")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Full time" })).toBeChecked();
    expect(screen.getByLabelText("About you")).toHaveValue("Reliable and on time.");
  });

  it("groups the fields into three labelled sections", () => {
    render(<ProfileEditor driver={buildDriver()} />);
    for (const name of ["Basics", "Role and licenses", "Availability"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
  });

  it("handles a card with empty optional fields", () => {
    render(<ProfileEditor driver={buildDriver({ city: null, bio: null })} />);
    expect(screen.getByLabelText("City")).toHaveValue("");
    expect(screen.getByLabelText("About you")).toHaveValue("");
    expect(screen.getByText("0/500")).toBeInTheDocument();
  });

  it("saves edited values and confirms with a toast", async () => {
    actions.updateCardAction.mockResolvedValue(ok(buildDriver()));
    render(<ProfileEditor driver={buildDriver()} />);

    await userEvent.clear(screen.getByLabelText("City"));
    await userEvent.type(screen.getByLabelText("City"), "Austin");
    await userEvent.click(screen.getByText("Mechanic"));
    await userEvent.click(screen.getByText("Weekends"));
    await userEvent.clear(screen.getByLabelText(/Years of experience/));
    await userEvent.type(screen.getByLabelText(/Years of experience/), "12");
    await userEvent.click(save());

    await waitFor(() =>
      expect(actions.updateCardAction).toHaveBeenCalledWith({
        fullName: "Pat Driver",
        city: "Austin",
        state: "TX",
        zip: "75201",
        serviceRadiusMiles: 50,
        operatorTypes: ["cdl_driver", "mechanic"],
        cdlClass: "A",
        endorsements: ["H", "T"],
        yearsExperience: 12,
        certifications: ["TWIC"],
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
      failure("Check the form", { state: "Select your state" }),
    );
    render(<ProfileEditor driver={buildDriver()} />);
    await userEvent.click(save());

    expect(await screen.findByText("Select your state")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows a general server error", async () => {
    actions.updateCardAction.mockResolvedValue(failure("Your account has been blocked."));
    render(<ProfileEditor driver={buildDriver()} />);
    await userEvent.click(save());
    expect(await screen.findByRole("alert")).toHaveTextContent("Your account has been blocked.");
  });
});
