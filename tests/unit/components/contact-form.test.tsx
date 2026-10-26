import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "@/components/marketing/ContactForm";
import type { Result } from "@/server/errors/AppError";

const actions = vi.hoisted(() => ({ sendContactMessageAction: vi.fn() }));
vi.mock("@/server/actions/marketing.actions", () => actions);

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const failure = (
  code: "VALIDATION" | "RATE_LIMITED" | "INTERNAL",
  message: string,
  fieldErrors?: Record<string, string>,
): Result<never> => ({ ok: false, error: { code, message, fieldErrors } });

const TOKEN = "1760443200000.abc";
const SUPPORT = "support@fleetgridus.com";

function renderForm() {
  return render(<ContactForm token={TOKEN} supportEmail={SUPPORT} />);
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Name/), "Pat Owner");
  await user.type(screen.getByLabelText(/^Email/), "pat@example.com");
  await user.click(screen.getByRole("radio", { name: "Carrier" }));
  await user.type(screen.getByLabelText(/^Message/), "We have three open shifts next week.");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ContactForm", () => {
  it("shows visible labels for the five fields, the three roles, no phone field and the privacy note", () => {
    renderForm();
    for (const label of [/^Name/, /^Email/, /^Company$/, /^Message/]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("group", { name: /I am a/ })).toBeInTheDocument();
    for (const role of ["Carrier", "Driver", "Other"]) {
      expect(screen.getByRole("radio", { name: role })).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByText(/We use your details only to reply/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toHaveClass("h-target-lg");
  });

  it("keeps the honeypot out of sight and out of the tab order", () => {
    renderForm();
    const honeypot = document.querySelector("input[name=company_website]") as HTMLInputElement;
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot).toHaveAttribute("autocomplete", "off");
    expect(honeypot.closest("[aria-hidden=true]")).toHaveClass("sr-only");
  });

  it("an empty submit lists every error at the top, focuses the list, and shows them under the fields", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "Send message" }));

    const summary = await screen.findByText("4 fields need attention");
    const box = summary.closest("[data-slot=contact-error-summary]") as HTMLElement;
    await waitFor(() => expect(box).toHaveFocus());
    expect(within(box).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Name",
      "Email",
      "I am a",
      "Message",
    ]);
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^Name/)).toHaveAccessibleDescription("Enter your name");
    expect(screen.getByText("Choose Carrier, Driver or Other")).toBeInTheDocument();
    expect(actions.sendContactMessageAction).not.toHaveBeenCalled();
  });

  it("sends the fields with the token and an empty honeypot, says Sending meanwhile, then thanks by email", async () => {
    const user = userEvent.setup();
    let resolve!: (value: Result<{ email: string }>) => void;
    actions.sendContactMessageAction.mockReturnValue(new Promise((r) => (resolve = r)));
    renderForm();
    await fillValid(user);
    await user.type(screen.getByLabelText(/^Company$/), "Bayou Freight");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("button", { name: "Sending" })).toBeDisabled();
    expect(actions.sendContactMessageAction).toHaveBeenCalledWith({
      name: "Pat Owner",
      email: "pat@example.com",
      role: "carrier",
      company: "Bayou Freight",
      message: "We have three open shifts next week.",
      company_website: "",
      token: TOKEN,
    });

    await act(async () => resolve(ok({ email: "pat@example.com" })));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Thanks. Your message was sent.");
    expect(status).toHaveTextContent("We will reply to pat@example.com.");
    expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
  });

  it("a send failure keeps the form and shows the error with the support address", async () => {
    const user = userEvent.setup();
    actions.sendContactMessageAction.mockResolvedValue(
      failure("INTERNAL", "Something went wrong. Please try again."),
    );
    renderForm();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));

    const note = await screen.findByRole("alert");
    expect(note).toHaveAttribute("data-slot", "contact-failed");
    expect(note).toHaveTextContent(
      "Your message did not send. Please try again or email support@fleetgridus.com.",
    );
    expect(within(note).getByRole("link", { name: SUPPORT })).toHaveAttribute(
      "href",
      `mailto:${SUPPORT}`,
    );
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  it("a rate limit shows the server's own words", async () => {
    const user = userEvent.setup();
    actions.sendContactMessageAction.mockResolvedValue(
      failure("RATE_LIMITED", "Too many messages for now. Please try again later, or email support."),
    );
    renderForm();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many messages for now.");
  });

  it("server field errors land under the field and in the summary", async () => {
    const user = userEvent.setup();
    actions.sendContactMessageAction.mockResolvedValue(
      failure("VALIDATION", "Please check the highlighted fields", {
        email: "Enter a valid email address",
      }),
    );
    renderForm();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("One field needs attention")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText(/^Email/)).toHaveAccessibleDescription("Enter a valid email address"),
    );
  });

  it("a server error about the token shows the general error state", async () => {
    const user = userEvent.setup();
    actions.sendContactMessageAction.mockResolvedValue(
      failure("VALIDATION", "The page has expired", { token: "The page has expired" }),
    );
    renderForm();
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveAttribute("data-slot", "contact-failed");
  });
});
