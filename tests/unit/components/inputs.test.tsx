import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChoiceGroup } from "@/components/shared/ChoiceGroup";
import { TagInput } from "@/components/shared/TagInput";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
  { value: "c", label: "Charlie" },
] as const;
type Value = (typeof OPTIONS)[number]["value"];

function MultiHarness({ onChange = vi.fn(), ...rest }: { onChange?: (v: Value[]) => void }) {
  const [value, setValue] = useState<Value[]>([]);
  return (
    <ChoiceGroup
      multiple
      label="Letters"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      {...rest}
    />
  );
}

function SingleHarness() {
  const [value, setValue] = useState<Value>();
  return <ChoiceGroup label="Letter" options={OPTIONS} value={value} onChange={setValue} />;
}

describe("ChoiceGroup", () => {
  it("multiple: toggles checkboxes on and off, keeping selection order", async () => {
    const onChange = vi.fn();
    render(<MultiHarness onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Letters" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(3);

    await userEvent.click(screen.getByText("Bravo"));
    await userEvent.click(screen.getByText("Alpha"));
    expect(onChange).toHaveBeenLastCalledWith(["b", "a"]);
    expect(screen.getByRole("checkbox", { name: "Bravo" })).toBeChecked();

    await userEvent.click(screen.getByText("Bravo"));
    expect(onChange).toHaveBeenLastCalledWith(["a"]);
    expect(screen.getByRole("checkbox", { name: "Bravo" })).not.toBeChecked();
  });

  it("single: behaves as a radio group", async () => {
    render(<SingleHarness />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();

    await userEvent.click(screen.getByText("Alpha"));
    await userEvent.click(screen.getByText("Charlie"));
    expect(screen.getByRole("radio", { name: "Charlie" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Alpha" })).not.toBeChecked();
  });

  it("works with the keyboard", async () => {
    render(<MultiHarness />);
    await userEvent.tab();
    expect(screen.getByRole("checkbox", { name: "Alpha" })).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeChecked();
  });

  it("shows required marker, description and error, linked to the group", () => {
    render(
      <ChoiceGroup
        multiple
        label="Letters"
        description="Select all that apply."
        error="Select at least one"
        options={OPTIONS}
        value={["a"]}
        onChange={vi.fn()}
        columns={2}
        required
      />,
    );
    const group = screen.getByRole("group", { name: /Letters/ });
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Select at least one");
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group.getAttribute("aria-describedby")?.split(" ")).toEqual([
      screen.getByText("Select all that apply.").id,
      error.id,
    ]);
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows an option description under the label, as the description and not the name", () => {
    render(
      <ChoiceGroup
        label="Letter"
        options={[
          { value: "a", label: "Alpha", description: "The first letter" },
          { value: "b", label: "Bravo" },
        ]}
        value={undefined}
        onChange={vi.fn()}
      />,
    );
    const alpha = screen.getByRole("radio", { name: "Alpha" });
    expect(alpha).toHaveAccessibleDescription("The first letter");
    expect(screen.getByText("The first letter")).toHaveClass("text-muted-foreground");
    expect(screen.getByRole("radio", { name: "Bravo" })).not.toHaveAttribute("aria-describedby");
  });

  it("has no error wiring when valid", () => {
    render(<SingleHarness />);
    const group = screen.getByRole("group", { name: "Letter" });
    expect(group).not.toHaveAttribute("aria-invalid");
    expect(group).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can be disabled", async () => {
    const onChange = vi.fn();
    render(
      <ChoiceGroup
        multiple
        label="Letters"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
        disabled
      />,
    );
    await userEvent.click(screen.getByText("Alpha"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Alpha" })).toBeDisabled();
  });

  it("each option is at least 64px tall and selects in graphite", async () => {
    render(<SingleHarness />);
    const option = screen.getByText("Alpha").closest("label")!;
    expect(option).toHaveClass("min-h-card-min");
    await userEvent.click(option);
    expect(option).toHaveClass("border-selection", "bg-selection-tint");
  });
});

function TagHarness({
  initial = [],
  onChange = vi.fn(),
  ...rest
}: {
  initial?: string[];
  onChange?: (value: string[]) => void;
  maxTags?: number;
  error?: string;
  description?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <TagInput
      label="Certifications"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      {...rest}
    />
  );
}

describe("TagInput", () => {
  const input = () => screen.getByRole("textbox", { name: "Certifications" });
  const tags = () =>
    within(screen.getByRole("list", { name: "Certifications added" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);

  it("adds a tag with Enter without submitting the form", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <TagHarness />
      </form>,
    );
    await userEvent.type(input(), "TWIC{Enter}");
    expect(tags()).toEqual(["TWIC"]);
    expect(input()).toHaveValue("");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("adds a tag with a comma, the Add button and on blur", async () => {
    render(<TagHarness />);
    await userEvent.type(input(), "TWIC,");
    await userEvent.type(input(), "OSHA 10");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.type(input(), "  Forklift  ");
    await userEvent.tab();
    expect(tags()).toEqual(["TWIC", "OSHA 10", "Forklift"]);
  });

  it("ignores blanks and duplicates (case-insensitive)", async () => {
    const onChange = vi.fn();
    render(<TagHarness initial={["TWIC"]} onChange={onChange} />);
    await userEvent.type(input(), "   {Enter}");
    await userEvent.type(input(), "twic{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(tags()).toEqual(["TWIC"]);
  });

  it("the Add button is disabled until something is typed", async () => {
    render(<TagHarness />);
    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();
    await userEvent.type(input(), "T");
    expect(add).toBeEnabled();
  });

  it("removes a tag with its button and with Backspace on an empty field", async () => {
    render(<TagHarness initial={["TWIC", "OSHA 10", "Forklift"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove OSHA 10" }));
    expect(tags()).toEqual(["TWIC", "Forklift"]);

    await userEvent.click(input());
    await userEvent.keyboard("{Backspace}");
    expect(tags()).toEqual(["TWIC"]);
  });

  it("Backspace edits the draft before it removes tags", async () => {
    render(<TagHarness initial={["TWIC"]} />);
    await userEvent.type(input(), "ab{Backspace}");
    expect(input()).toHaveValue("a");
    expect(tags()).toEqual(["TWIC"]);
  });

  it("stops accepting tags at the limit", async () => {
    render(<TagHarness initial={["A", "B"]} maxTags={2} />);
    expect(input()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("shows no list when empty, and shows description and error", () => {
    render(<TagHarness description="Optional." error="Add up to 20 certifications" />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    const error = screen.getByRole("alert");
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(input().getAttribute("aria-describedby")?.split(" ")).toEqual([
      screen.getByText("Optional.").id,
      error.id,
    ]);
  });

  it("can be disabled", () => {
    render(<TagHarness initial={["TWIC"]} disabled />);
    expect(input()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove TWIC" })).toBeDisabled();
  });
});
