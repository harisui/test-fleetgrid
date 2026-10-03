import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteAccountCard } from "@/components/account/DeleteAccountCard";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  requestAccountCodeAction: vi.fn(),
  deleteMyAccountAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/account.actions", () => actions);
vi.mock("sonner", () => ({ toast }));

const PHONE = "+15555550100";
const open = () => userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
const dialog = () => screen.findByRole("dialog");

describe("DeleteAccountCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.requestAccountCodeAction.mockResolvedValue({ ok: true, data: { phone: PHONE } });
  });

  it("explains itself, asks first, and sends nothing when cancelled", async () => {
    render(<DeleteAccountCard phone={PHONE} />);
    expect(screen.getByRole("region", { name: "Delete account" })).toHaveTextContent(
      "This cannot be undone",
    );
    await open();
    const modal = await dialog();
    expect(within(modal).getByText("Delete your account?")).toBeInTheDocument();
    expect(within(modal).getByText(/we text a code to \(555\) 555-0100/)).toBeInTheDocument();

    await userEvent.click(within(modal).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(actions.requestAccountCodeAction).not.toHaveBeenCalled();
    expect(actions.deleteMyAccountAction).not.toHaveBeenCalled();
  });

  it("texts a code to the same number, then deletes with that code and goes to login", async () => {
    actions.deleteMyAccountAction.mockResolvedValue({ ok: true, data: { redirectTo: "/login" } });
    render(<DeleteAccountCard phone={PHONE} />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Text me a code" }));

    expect(actions.requestAccountCodeAction).toHaveBeenCalledOnce();
    const modal = await dialog();
    expect(
      await within(modal).findByText("Enter the code to delete your account"),
    ).toBeInTheDocument();
    expect(within(modal).getByText("(555) 555-0100")).toBeInTheDocument();
    expect(within(modal).getByText(/Resend in 1:00/)).toBeInTheDocument();
    expect(actions.deleteMyAccountAction).not.toHaveBeenCalled();

    await userEvent.type(within(modal).getByLabelText(/6-digit code/), "123456");
    await userEvent.click(within(modal).getByRole("button", { name: "Delete for good" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(actions.deleteMyAccountAction).toHaveBeenCalledWith({ code: "123456" });
    expect(toast.success).toHaveBeenCalledWith("Your account was deleted");
  });

  it("will not delete without a complete code", async () => {
    render(<DeleteAccountCard phone={PHONE} />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Text me a code" }));
    const modal = await dialog();
    await userEvent.type(await within(modal).findByLabelText(/6-digit code/), "12");
    await userEvent.click(within(modal).getByRole("button", { name: "Delete for good" }));
    expect(await within(modal).findByRole("alert")).toHaveTextContent("Enter the 6-digit code");
    expect(actions.deleteMyAccountAction).not.toHaveBeenCalled();
  });

  it("shows the server's answer for a wrong code and keeps the account", async () => {
    actions.deleteMyAccountAction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Check the form",
        fieldErrors: { code: "That code is incorrect or has expired" },
      },
    });
    render(<DeleteAccountCard phone={PHONE} />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Text me a code" }));
    const modal = await dialog();
    await userEvent.type(await within(modal).findByLabelText(/6-digit code/), "000000");
    await userEvent.click(within(modal).getByRole("button", { name: "Delete for good" }));

    expect(await within(modal).findByRole("alert")).toHaveTextContent(
      "That code is incorrect or has expired",
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(within(modal).getByRole("button", { name: "Delete for good" })).toBeEnabled();
  });

  it("shows why a code could not be sent", async () => {
    actions.requestAccountCodeAction.mockResolvedValue({
      ok: false,
      error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a minute." },
    });
    render(<DeleteAccountCard phone={PHONE} />);
    await open();
    await userEvent.click(await screen.findByRole("button", { name: "Text me a code" }));
    const modal = await dialog();
    expect(await within(modal).findByRole("alert")).toHaveTextContent("Too many attempts");
    expect(within(modal).getByText("Delete your account?")).toBeInTheDocument();
  });
});
