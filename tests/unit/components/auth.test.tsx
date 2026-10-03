import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthCard } from "@/components/auth/AuthCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { OtpForm } from "@/components/auth/OtpForm";
import { PhoneForm } from "@/components/auth/PhoneForm";
import { RoleChooser } from "@/components/auth/RoleChooser";
import type { Result } from "@/server/errors/AppError";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
const actions = vi.hoisted(() => ({
  requestOtpAction: vi.fn(),
  verifyOtpAction: vi.fn(),
  chooseRoleAction: vi.fn(),
  signOutAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/auth.actions", () => actions);
vi.mock("sonner", () => ({ toast }));

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const failure = (
  code: "VALIDATION" | "RATE_LIMITED" | "INTERNAL" | "CONFLICT",
  message: string,
  fieldErrors?: Record<string, string>,
): Result<never> => ({ ok: false, error: { code, message, fieldErrors } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PhoneForm", () => {
  const input = () => screen.getByLabelText(/Mobile number/);
  const submit = () => screen.getByRole("button", { name: "Send code" });

  it("formats the number as it is typed", async () => {
    render(<PhoneForm />);
    await userEvent.type(input(), "5555550100");
    expect(input()).toHaveValue("(555) 555-0100");
  });

  it("is a telephone input with autofill hints", () => {
    render(<PhoneForm />);
    expect(input()).toHaveAttribute("type", "tel");
    expect(input()).toHaveAttribute("inputmode", "tel");
    expect(input()).toHaveAttribute("autocomplete", "tel-national");
  });

  it("sends the E.164 number and goes to the verify screen", async () => {
    actions.requestOtpAction.mockResolvedValue(ok({ phone: "+15555550100" }));
    render(<PhoneForm />);
    await userEvent.type(input(), "5555550100");
    await userEvent.click(submit());

    expect(actions.requestOtpAction).toHaveBeenCalledWith({ phone: "+15555550100" });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/verify?phone=%2B15555550100"));
  });

  it("carries the preselected role to the verify screen", async () => {
    actions.requestOtpAction.mockResolvedValue(ok({ phone: "+15555550101" }));
    render(<PhoneForm role="carrier" />);
    await userEvent.type(input(), "5555550101");
    await userEvent.click(submit());

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/verify?phone=%2B15555550101&role=carrier"),
    );
  });

  it.each([
    ["", "Enter your mobile number"],
    ["555555", "Enter a valid US mobile number"],
    ["0555550100", "Enter a valid US mobile number"],
  ])("shows an error for %j and does not call the server", async (value, message) => {
    render(<PhoneForm />);
    if (value) await userEvent.type(input(), value);
    await userEvent.click(submit());

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(actions.requestOtpAction).not.toHaveBeenCalled();
  });

  it("clears the error when the user types again", async () => {
    render(<PhoneForm />);
    await userEvent.click(submit());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.type(input(), "5");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a server field error and stays on the page", async () => {
    actions.requestOtpAction.mockResolvedValue(
      failure("VALIDATION", "Check the form", { phone: "We could not send a code to that number" }),
    );
    render(<PhoneForm />);
    await userEvent.type(input(), "5555550100");
    await userEvent.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not send a code to that number",
    );
    expect(router.push).not.toHaveBeenCalled();
    expect(submit()).toBeEnabled();
  });

  it("shows a rate limit message", async () => {
    actions.requestOtpAction.mockResolvedValue(
      failure("RATE_LIMITED", "Too many attempts. Please wait a minute and try again."),
    );
    render(<PhoneForm />);
    await userEvent.type(input(), "5555550100");
    await userEvent.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("also toasts unexpected errors", async () => {
    actions.requestOtpAction.mockResolvedValue(
      failure("INTERNAL", "Something went wrong. Please try again."),
    );
    render(<PhoneForm />);
    await userEvent.type(input(), "5555550100");
    await userEvent.click(submit());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Something went wrong. Please try again."),
    );
  });

  it("shows a loading state and ignores a second submit while sending", async () => {
    let resolve!: (value: Result<{ phone: string }>) => void;
    actions.requestOtpAction.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<PhoneForm />);
    await userEvent.type(input(), "5555550100");
    await userEvent.click(submit());

    const busy = screen.getByRole("button", { name: "Sending code..." });
    expect(busy).toBeDisabled();
    fireEvent.submit(busy.closest("form")!);
    expect(actions.requestOtpAction).toHaveBeenCalledOnce();

    await act(async () => resolve(ok({ phone: "+15555550100" })));
  });
});

describe("OtpForm", () => {
  const PHONE = "+15555550100";
  const input = () => screen.getByLabelText(/6-digit code/);

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the number the code was sent to and a way to change it", () => {
    render(<OtpForm phone={PHONE} />);
    expect(screen.getByText("(555) 555-0100")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change number" })).toHaveAttribute("href", "/login");
  });

  it("supports SMS autofill and a numeric keypad", () => {
    render(<OtpForm phone={PHONE} />);
    expect(input()).toHaveAttribute("autocomplete", "one-time-code");
    expect(input()).toHaveAttribute("inputmode", "numeric");
  });

  it("verifies automatically once six digits are typed and follows the redirect", async () => {
    actions.verifyOtpAction.mockResolvedValue(ok({ redirectTo: "/driver/profile" }));
    render(<OtpForm phone={PHONE} />);
    await userEvent.type(input(), "123456");

    expect(actions.verifyOtpAction).toHaveBeenCalledOnce();
    expect(actions.verifyOtpAction).toHaveBeenCalledWith({ phone: PHONE, code: "123456" });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/driver/profile"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("accepts a pasted code with spaces or dashes", async () => {
    actions.verifyOtpAction.mockResolvedValue(ok({ redirectTo: "/choose-role" }));
    render(<OtpForm phone={PHONE} />);
    await userEvent.click(input());
    await userEvent.paste("123-456");

    expect(input()).toHaveValue("123456");
    expect(actions.verifyOtpAction).toHaveBeenCalledWith({ phone: PHONE, code: "123456" });
  });

  it("ignores letters and extra digits", async () => {
    actions.verifyOtpAction.mockResolvedValue(failure("VALIDATION", "x", { code: "Wrong" }));
    render(<OtpForm phone={PHONE} />);
    fireEvent.change(input(), { target: { value: "12ab" } });
    expect(input()).toHaveValue("12");
    fireEvent.change(input(), { target: { value: "1234567890" } });
    expect(input()).toHaveValue("123456");
  });

  it("passes the preselected role on to the role picker", async () => {
    actions.verifyOtpAction.mockResolvedValue(ok({ redirectTo: "/choose-role" }));
    render(<OtpForm phone={PHONE} role="carrier" />);
    await userEvent.type(input(), "123456");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/choose-role?role=carrier"));
  });

  it("does not add the role when the user already has a profile", async () => {
    actions.verifyOtpAction.mockResolvedValue(ok({ redirectTo: "/carrier" }));
    render(<OtpForm phone={PHONE} role="carrier" />);
    await userEvent.type(input(), "123456");

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/carrier"));
  });

  it("shows an error for a wrong code and lets the user try again", async () => {
    actions.verifyOtpAction.mockResolvedValueOnce(
      failure("VALIDATION", "Check the form", { code: "That code is incorrect or has expired" }),
    );
    render(<OtpForm phone={PHONE} />);
    await userEvent.type(input(), "000000");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That code is incorrect or has expired",
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(input()).toBeEnabled();

    actions.verifyOtpAction.mockResolvedValueOnce(ok({ redirectTo: "/driver/profile" }));
    await userEvent.clear(input());
    await userEvent.type(input(), "123456");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/driver/profile"));
  });

  it("shows the general message when there is no field error (blocked account)", async () => {
    actions.verifyOtpAction.mockResolvedValue(
      failure("CONFLICT", "Your account has been blocked. Contact support for help."),
    );
    render(<OtpForm phone={PHONE} />);
    await userEvent.type(input(), "123456");
    expect(await screen.findByRole("alert")).toHaveTextContent("blocked");
  });

  it("the Verify button reports an incomplete code without calling the server", async () => {
    render(<OtpForm phone={PHONE} />);
    await userEvent.type(input(), "123");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter the 6-digit code");
    expect(actions.verifyOtpAction).not.toHaveBeenCalled();
  });

  it("the Verify button retries the same code after a failure", async () => {
    actions.verifyOtpAction.mockResolvedValueOnce(failure("INTERNAL", "Something went wrong."));
    render(<OtpForm phone={PHONE} />);
    await userEvent.type(input(), "123456");
    await screen.findByRole("alert");

    actions.verifyOtpAction.mockResolvedValueOnce(ok({ redirectTo: "/driver/profile" }));
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(actions.verifyOtpAction).toHaveBeenCalledTimes(2));
  });

  it("disables the input while checking", async () => {
    let resolve!: (value: Result<{ redirectTo: string }>) => void;
    actions.verifyOtpAction.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<OtpForm phone={PHONE} />);
    await userEvent.type(input(), "123456");

    expect(input()).toBeDisabled();
    const busy = screen.getByRole("button", { name: "Checking..." });
    expect(busy).toBeDisabled();
    fireEvent.submit(busy.closest("form")!);
    expect(actions.verifyOtpAction).toHaveBeenCalledOnce();

    await act(async () => resolve(ok({ redirectTo: "/driver/profile" })));
  });

  describe("resend", () => {
    it("counts down 60 seconds before resend is offered", () => {
      vi.useFakeTimers();
      render(<OtpForm phone={PHONE} />);
      expect(screen.getByText("Resend code in 60s")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Resend code" })).not.toBeInTheDocument();

      act(() => void vi.advanceTimersByTime(1000));
      expect(screen.getByText("Resend code in 59s")).toBeInTheDocument();

      for (let second = 0; second < 59; second += 1) act(() => void vi.advanceTimersByTime(1000));
      expect(screen.getByRole("button", { name: "Resend code" })).toBeInTheDocument();
    });

    it("resends, clears the code and restarts the cooldown", async () => {
      actions.requestOtpAction.mockResolvedValue(ok({ phone: PHONE }));
      render(<OtpForm phone={PHONE} cooldownSeconds={0} />);
      await userEvent.type(input(), "12");
      await userEvent.click(screen.getByRole("button", { name: "Resend code" }));

      expect(actions.requestOtpAction).toHaveBeenCalledWith({ phone: PHONE });
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("We sent you a new code"));
      expect(input()).toHaveValue("");
    });

    it("restarts the countdown after a resend", async () => {
      actions.requestOtpAction.mockResolvedValue(ok({ phone: PHONE }));
      const { rerender } = render(<OtpForm phone={PHONE} cooldownSeconds={0} />);
      rerender(<OtpForm phone={PHONE} cooldownSeconds={30} />);
      await userEvent.click(screen.getByRole("button", { name: "Resend code" }));

      expect(await screen.findByText("Resend code in 30s")).toBeInTheDocument();
    });

    it("shows an error when the resend is rate limited", async () => {
      actions.requestOtpAction.mockResolvedValue(
        failure("RATE_LIMITED", "Too many attempts. Please wait a minute and try again."),
      );
      render(<OtpForm phone={PHONE} cooldownSeconds={0} />);
      await userEvent.click(screen.getByRole("button", { name: "Resend code" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("ignores a second tap while a resend is in flight", async () => {
      let resolve!: (value: Result<{ phone: string }>) => void;
      actions.requestOtpAction.mockReturnValue(new Promise((r) => (resolve = r)));
      render(<OtpForm phone={PHONE} cooldownSeconds={0} />);
      const button = screen.getByRole("button", { name: "Resend code" });
      await userEvent.click(button);

      expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
      expect(actions.requestOtpAction).toHaveBeenCalledOnce();
      await act(async () => resolve(ok({ phone: PHONE })));
    });
  });
});

describe("RoleChooser", () => {
  const driver = () => screen.getByRole("radio", { name: /I'm a Driver/ });
  const carrier = () => screen.getByRole("radio", { name: /I'm a Carrier/ });
  const submit = () => screen.getByRole("button", { name: "Continue" });

  it("offers Driver and Carrier, never Admin", () => {
    render(<RoleChooser />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(driver()).not.toBeChecked();
    expect(carrier()).not.toBeChecked();
    expect(screen.queryByText(/admin/i)).not.toBeInTheDocument();
  });

  it("preselects the role from the landing page", () => {
    render(<RoleChooser defaultRole="carrier" />);
    expect(carrier()).toBeChecked();
    expect(driver()).not.toBeChecked();
  });

  it("requires a choice", async () => {
    render(<RoleChooser />);
    await userEvent.click(submit());
    expect(screen.getByRole("alert")).toHaveTextContent("Choose Driver or Carrier");
    expect(actions.chooseRoleAction).not.toHaveBeenCalled();
  });

  it.each([
    ["driver", "/driver/profile", driver],
    ["carrier", "/carrier", carrier],
  ] as const)("creates a %s profile and goes to %s", async (role, path, option) => {
    actions.chooseRoleAction.mockResolvedValue(ok({ redirectTo: path }));
    render(<RoleChooser />);
    await userEvent.click(option());
    await userEvent.click(submit());

    expect(actions.chooseRoleAction).toHaveBeenCalledWith({ role });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(path));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("choosing clears a previous error", async () => {
    render(<RoleChooser />);
    await userEvent.click(submit());
    await userEvent.click(driver());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a server error and allows another try", async () => {
    actions.chooseRoleAction.mockResolvedValue(
      failure("CONFLICT", "Your account already has a role. Contact support to change it."),
    );
    render(<RoleChooser defaultRole="driver" />);
    await userEvent.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent("already has a role");
    expect(router.replace).not.toHaveBeenCalled();
    expect(submit()).toBeEnabled();
  });

  it("prefers a field error from the server", async () => {
    actions.chooseRoleAction.mockResolvedValue(
      failure("VALIDATION", "Check the form", { role: "Choose Driver or Carrier" }),
    );
    render(<RoleChooser defaultRole="driver" />);
    await userEvent.click(submit());
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose Driver or Carrier");
  });

  it("locks the form while saving and ignores a second tap", async () => {
    let resolve!: (value: Result<{ redirectTo: string }>) => void;
    actions.chooseRoleAction.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<RoleChooser defaultRole="driver" />);
    await userEvent.click(submit());

    expect(screen.getByRole("button", { name: "Setting up..." })).toBeDisabled();
    expect(driver()).toBeDisabled();
    expect(actions.chooseRoleAction).toHaveBeenCalledOnce();
    await act(async () => resolve(ok({ redirectTo: "/driver/profile" })));
  });
});

describe("LogoutButton and AuthCard", () => {
  it("LogoutButton is a submit button inside a form", () => {
    render(<LogoutButton />);
    const button = screen.getByRole("button", { name: "Log out" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).not.toBeNull();
    expect(button).toHaveClass("h-target");
  });

  it("AuthCard renders the title as the page heading, with an optional description", () => {
    const { rerender } = render(
      <AuthCard title="Log in" description="No password needed.">
        <p>Body</p>
      </AuthCard>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Log in" })).toBeInTheDocument();
    expect(screen.getByText("No password needed.")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();

    rerender(
      <AuthCard title="Enter your code">
        <p>Body</p>
      </AuthCard>,
    );
    expect(screen.queryByText("No password needed.")).not.toBeInTheDocument();
  });
});
