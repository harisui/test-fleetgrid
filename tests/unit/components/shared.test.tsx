import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inbox } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { StatusBadge } from "@/components/shared/StatusBadge";

describe("LoadingButton", () => {
  it("renders children and handles clicks when idle", async () => {
    const onClick = vi.fn();
    render(<LoadingButton onClick={onClick}>Save</LoadingButton>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-busy");
    expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is disabled, busy and shows a spinner while loading", async () => {
    const onClick = vi.fn();
    render(
      <LoadingButton loading onClick={onClick}>
        Save
      </LoadingButton>,
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("spinner")).toBeInTheDocument();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows loadingText while loading", () => {
    render(
      <LoadingButton loading loadingText="Saving...">
        Save
      </LoadingButton>,
    );
    expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("stays disabled when disabled is set without loading", () => {
    render(<LoadingButton disabled>Save</LoadingButton>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("passes through button props", () => {
    render(
      <LoadingButton type="submit" size="md">
        Go
      </LoadingButton>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveClass("h-target");
  });
});

describe("FormField", () => {
  it("connects the label to the control", () => {
    render(
      <FormField label="Full name">
        <input />
      </FormField>,
    );
    const input = screen.getByLabelText("Full name");
    expect(input).toHaveAttribute("id");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-required");
  });

  it("keeps an id provided on the control", () => {
    render(
      <FormField label="ZIP">
        <input id="zip" />
      </FormField>,
    );
    expect(screen.getByLabelText("ZIP")).toHaveAttribute("id", "zip");
  });

  it("marks required fields", () => {
    render(
      <FormField label="State" required>
        <input />
      </FormField>,
    );
    expect(screen.getByLabelText(/State/)).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the description and links it to the control", () => {
    render(
      <FormField label="Bio" description="Up to 500 characters">
        <textarea />
      </FormField>,
    );
    const control = screen.getByLabelText("Bio");
    const description = screen.getByText("Up to 500 characters");
    expect(control).toHaveAttribute("aria-describedby", description.id);
  });

  it("shows the error in place of the helper, with an icon in the field, and marks the control invalid", () => {
    const { container } = render(
      <FormField label="ZIP" description="5 digits" error="Enter a valid ZIP code">
        <input />
      </FormField>,
    );
    const control = screen.getByLabelText("ZIP");
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Enter a valid ZIP code");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAttribute("aria-describedby", error.id);
    expect(screen.queryByText("5 digits")).not.toBeInTheDocument();
    expect(container.querySelector("[data-slot=field-error]")).toBeInTheDocument();
    expect(control).toHaveClass("pr-12");
  });

  it("can keep the helper next to the error and leave the field icon out", () => {
    const { container } = render(
      <FormField
        label="About you"
        description="12 / 10"
        error="Keep it shorter"
        errorIcon={false}
        keepDescriptionOnError
      >
        <textarea />
      </FormField>,
    );
    const control = screen.getByLabelText("About you");
    expect(control.getAttribute("aria-describedby")?.split(" ")).toEqual([
      screen.getByText("12 / 10").id,
      screen.getByRole("alert").id,
    ]);
    expect(container.querySelector("[data-slot=field-error]")).not.toBeInTheDocument();
    expect(control).not.toHaveClass("pr-12");
  });

  it("applies a custom className to the wrapper", () => {
    const { container } = render(
      <FormField label="City" className="col-span-2">
        <input />
      </FormField>,
    );
    expect(container.firstChild).toHaveClass("col-span-2");
  });
});

describe("EmptyState", () => {
  it("renders only the title when nothing else is given", () => {
    render(<EmptyState title="No documents yet" />);
    expect(screen.getByRole("heading", { name: "No documents yet" })).toBeInTheDocument();
    expect(screen.queryByTestId("empty-state-icon")).not.toBeInTheDocument();
  });

  it("renders the icon, description and action", () => {
    render(
      <EmptyState
        title="No documents yet"
        description="Upload your CDL to get started."
        icon={Inbox}
        action={<button>Upload</button>}
        className="my-4"
      />,
    );
    expect(screen.getByText("Upload your CDL to get started.")).toBeInTheDocument();
    expect(screen.getByTestId("empty-state-icon")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it.each([
    ["pending", "Pending review", "bg-warning-subtle"],
    ["approved", "Approved", "bg-success-subtle"],
    ["blocked", "Blocked", "bg-destructive-subtle"],
  ] as const)("renders %s with its label and color", (status, label, className) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveAttribute("data-status", status);
    expect(badge).toHaveClass(className);
  });

  it("accepts a custom label and className", () => {
    render(<StatusBadge status="approved" label="Active" className="ml-2" />);
    const badge = screen.getByText("Active");
    expect(badge).toHaveClass("ml-2");
    expect(screen.queryByText("Approved")).not.toBeInTheDocument();
  });
});
