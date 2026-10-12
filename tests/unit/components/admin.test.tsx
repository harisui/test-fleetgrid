import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverReviewTable } from "@/components/admin/DriverReviewTable";
import type { Result } from "@/server/errors/AppError";
import type { DriverReview } from "@/server/services/AdminService";
import { buildDriver, buildProfile, OTHER_USER_ID, USER_ID } from "../../setup/factories";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({ setDriverStatusAction: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/admin.actions", () => actions);
vi.mock("sonner", () => ({ toast }));

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });

const review = (overrides: Partial<DriverReview> = {}): DriverReview => ({
  driver: buildDriver({ profileId: USER_ID }),
  profile: buildProfile({ id: USER_ID, status: "pending" }),
  inServiceArea: true,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DriverReviewTable", () => {
  it("shows the filters with the current one marked, and an empty queue", () => {
    render(<DriverReviewTable drivers={[]} filter="pending" />);
    const nav = screen.getByRole("navigation", { name: "Filter drivers" });
    expect(within(nav).getByRole("link", { name: "Pending review" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Approved" })).toHaveAttribute("href", "/admin?status=approved");
    expect(within(nav).getByRole("link", { name: "All drivers" })).toHaveAttribute("href", "/admin?status=all");
    expect(screen.getByText("Nothing waiting for review.")).toBeInTheDocument();
  });

  it("lists each driver with the facts a reviewer checks and the two buttons that apply", () => {
    render(
      <DriverReviewTable
        drivers={[
          review(),
          review({
            driver: buildDriver({
              id: "d2",
              profileId: OTHER_USER_ID,
              fullName: "Dallas Driver",
              cardCompleted: false,
            }),
            profile: buildProfile({ id: OTHER_USER_ID, phone: "+15555550108", status: "approved" }),
            inServiceArea: false,
          }),
        ]}
        filter="all"
      />,
    );
    const first = screen.getByText("Pat Driver").closest("li")!;
    expect(within(first).getByText(/\(555\) 555-0100/)).toBeInTheDocument();
    expect(within(first).getByText(/Dallas, TX 75201/)).toBeInTheDocument();
    expect(within(first).getByText("Pending review")).toBeInTheDocument();
    expect(within(first).getByText(/Class A, 6 to 10 years/)).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Approve Pat Driver" })).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Block Pat Driver" })).toBeInTheDocument();
    expect(within(first).queryByRole("button", { name: "Set pending Pat Driver" })).not.toBeInTheDocument();

    const second = screen.getByText("Dallas Driver").closest("li")!;
    expect(within(second).getByText("Outside launch area")).toBeInTheDocument();
    expect(within(second).getByText("Card incomplete")).toBeInTheDocument();
    expect(within(second).getByText("Approved")).toBeInTheDocument();
    expect(within(second).queryByRole("button", { name: "Approve Dallas Driver" })).not.toBeInTheDocument();
    expect(within(second).getByRole("button", { name: "Set pending Dallas Driver" })).toBeInTheDocument();
  });

  it("changes the status, confirms it and refreshes the list", async () => {
    actions.setDriverStatusAction.mockResolvedValue(ok(buildProfile({ status: "approved" })));
    render(<DriverReviewTable drivers={[review()]} filter="pending" />);
    await userEvent.click(screen.getByRole("button", { name: "Approve Pat Driver" }));
    await waitFor(() =>
      expect(actions.setDriverStatusAction).toHaveBeenCalledWith({ profileId: USER_ID, status: "approved" }),
    );
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Approved\./));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("reports a refusal", async () => {
    actions.setDriverStatusAction.mockResolvedValue({
      ok: false,
      error: { code: "FORBIDDEN", message: "Only FleetGrid staff can do this" },
    });
    render(<DriverReviewTable drivers={[review()]} filter="pending" />);
    await userEvent.click(screen.getByRole("button", { name: "Block Pat Driver" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Only FleetGrid staff can do this"));
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
