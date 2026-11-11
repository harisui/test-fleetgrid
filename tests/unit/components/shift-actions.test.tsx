import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftActions } from "@/components/carrier/ShiftActions";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({ cancelShiftAction: vi.fn(), releaseShiftAction: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/shift.actions", () => actions);
vi.mock("sonner", () => ({ toast }));

const SHIFT_ID = "50000000-0000-4000-8000-000000000001";
const props = { shiftId: SHIFT_ID, driverName: "Marcus Hill", noShowUntil: "Wed Nov 5, 4:00 PM" };

/** What the carrier can do with a booked shift as it moves through its day (pricing of 2026-11-11). */
describe("ShiftActions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("before the start: edit, cancel and repost, release, cancel", () => {
    render(<ShiftActions {...props} status="booked" phase="before_start" />);
    expect(screen.getByRole("link", { name: "Edit details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release and rebroadcast" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel shift" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=no-show-until]")).toBeNull();
  });

  it("once started: no cancel, only a release that goes out again", () => {
    render(<ShiftActions {...props} status="booked" phase="in_progress" />);
    expect(screen.getByRole("button", { name: "Release and rebroadcast" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel shift" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel and repost/ })).not.toBeInTheDocument();
  });

  it("after the end: says until when a no-show can be reported, and reports it without going out again", async () => {
    actions.releaseShiftAction.mockResolvedValue({ ok: true, data: { shift: {}, broadcast: null } });
    render(<ShiftActions {...props} status="booked" phase="no_show_window" />);
    expect(document.querySelector("[data-slot=no-show-until]")).toHaveTextContent(
      "You can report a no-show until Wed Nov 5, 4:00 PM.",
    );
    expect(screen.queryByRole("link", { name: "Edit details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel shift" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Report a no-show" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Report a no-show for Marcus Hill?");
    expect(dialog).toHaveTextContent("The shift has ended, so it does not go out again, and it is not a completed fill.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Report a no-show" }));
    await waitFor(() => expect(actions.releaseShiftAction).toHaveBeenCalledWith({ shiftId: SHIFT_ID, reason: "no_show" }));
    expect(toast.success).toHaveBeenCalledWith("No-show reported");
  });

  it("2 hours after the end: a completed fill, no actions", () => {
    render(<ShiftActions {...props} status="booked" phase="completed" />);
    expect(document.querySelector("[data-slot=completed-fill]")).toHaveTextContent("This shift counts as a completed fill.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("an open shift keeps its actions", () => {
    render(<ShiftActions {...props} status="open" phase={null} noShowUntil={null} />);
    expect(screen.getByRole("button", { name: "Cancel shift" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Release|no-show/ })).not.toBeInTheDocument();
  });
});
