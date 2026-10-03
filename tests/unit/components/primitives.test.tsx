import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Truck, Wrench } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CheckBadge } from "@/components/shared/CheckBadge";
import { ChipGroup } from "@/components/shared/ChipGroup";
import { ConsentCard } from "@/components/shared/ConsentCard";
import { FormField } from "@/components/shared/FormField";
import { InlineNote } from "@/components/shared/InlineNote";
import { OptionGroup } from "@/components/shared/OptionGroup";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Stepper } from "@/components/shared/Stepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WORK_TYPE_OPTIONS } from "@/lib/onboarding/options";

const SELECTED = ["border-selection", "bg-selection-tint", "ring-selection"];
const UNSELECTED = ["border-border-strong"];

describe("Button", () => {
  it("is 56px, orange and bold by default", () => {
    render(<Button>Next</Button>);
    const button = screen.getByRole("button", { name: "Next" });
    expect(button).toHaveClass("h-target-lg", "bg-primary", "text-primary-foreground", "font-bold");
    expect(button).toHaveAttribute("data-variant", "primary");
    expect(button.className).not.toMatch(/scale|translate|rounded-(full|xl)/);
  });

  it.each([
    ["secondary", ["bg-card", "border-border-strong"]],
    ["ghost", ["bg-transparent"]],
    ["destructive", ["bg-destructive"]],
    ["link", ["underline"]],
  ] as const)("variant %s never uses the orange fill", (variant, classes) => {
    render(<Button variant={variant}>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    for (const className of classes) expect(button).toHaveClass(className);
    expect(button.className).not.toMatch(/\bbg-primary\b/);
  });

  it.each([
    ["md", "h-target"],
    ["icon", "size-target"],
  ] as const)("size %s is at least 48px", (size, className) => {
    render(
      <Button size={size} aria-label="Go">
        Go
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Go" })).toHaveClass(className);
  });
});

describe("Input, Textarea, FormField", () => {
  it("fields are 56px with a 2px border and 18px text", () => {
    render(<Input aria-label="ZIP" />);
    expect(screen.getByRole("textbox", { name: "ZIP" })).toHaveClass(
      "h-target-lg",
      "border-2",
      "text-body",
      "rounded-field",
    );
  });

  it("textarea uses the same border and type", () => {
    render(<Textarea aria-label="About" />);
    expect(screen.getByRole("textbox", { name: "About" })).toHaveClass("border-2", "text-body");
  });

  it("shows an error with an icon and links it to the field", () => {
    render(
      <FormField label="ZIP code" error="Enter a 5-digit ZIP code, like 60601">
        <Input />
      </FormField>,
    );
    const field = screen.getByLabelText("ZIP code");
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Enter a 5-digit ZIP code, like 60601");
    expect(error.querySelector("svg")).not.toBeNull();
    expect(error).toHaveClass("text-destructive", "font-semibold");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", error.id);
  });

  it("shows a success check inside the field when asked, but never with an error", () => {
    const { container, rerender } = render(
      <FormField label="ZIP code" success>
        <Input />
      </FormField>,
    );
    expect(container.querySelector("[data-slot=field-success]")).not.toBeNull();
    expect(screen.getByLabelText("ZIP code")).toHaveClass("pr-12");

    rerender(
      <FormField label="ZIP code" success error="Nope">
        <Input />
      </FormField>,
    );
    expect(container.querySelector("[data-slot=field-success]")).toBeNull();
  });
});

function OptionHarness({
  multiple,
  onChange = vi.fn(),
  error,
}: {
  multiple?: boolean;
  onChange?: (value: unknown) => void;
  error?: string;
}) {
  const [single, setSingle] = useState<"cdl_driver" | "yard_spotter" | "mechanic">();
  const [many, setMany] = useState<("cdl_driver" | "yard_spotter" | "mechanic")[]>([]);
  return multiple ? (
    <OptionGroup
      multiple
      label="What work do you do?"
      options={WORK_TYPE_OPTIONS}
      value={many}
      onChange={(next) => {
        setMany(next);
        onChange(next);
      }}
      error={error}
    />
  ) : (
    <OptionGroup
      label="What work do you do?"
      labelHidden
      options={WORK_TYPE_OPTIONS}
      value={single}
      onChange={(next) => {
        setSingle(next);
        onChange(next);
      }}
      error={error}
    />
  );
}

describe("OptionGroup", () => {
  it("renders icon cards with a title and description, 64px minimum", () => {
    render(<OptionHarness />);
    const card = screen.getByRole("radio", { name: /CDL driver/ });
    expect(card).toHaveClass("min-h-card-min", "rounded-card");
    expect(within(card).getByText("Drive trucks that need a CDL")).toBeInTheDocument();
    expect(card.querySelector("svg")).not.toBeNull();
  });

  it("single: behaves as a radio group with aria-checked, graphite selection and the check badge", async () => {
    const onChange = vi.fn();
    render(<OptionHarness onChange={onChange} />);
    const group = screen.getByRole("radiogroup", { name: "What work do you do?" });
    const driver = within(group).getByRole("radio", { name: /CDL driver/ });
    const mechanic = within(group).getByRole("radio", { name: /Mechanic/ });
    expect(driver).toHaveAttribute("aria-checked", "false");
    for (const className of UNSELECTED) expect(driver).toHaveClass(className);
    expect(driver.querySelector("[data-slot=check-badge]")).toBeNull();

    await userEvent.click(mechanic);
    expect(onChange).toHaveBeenLastCalledWith("mechanic");
    expect(mechanic).toHaveAttribute("aria-checked", "true");
    expect(mechanic).toHaveAttribute("data-selected", "true");
    for (const className of SELECTED) expect(mechanic).toHaveClass(className);
    expect(mechanic.querySelector("[data-slot=check-badge]")).not.toBeNull();
    expect(mechanic.querySelector("[data-slot=check-badge]")).toHaveClass("bg-primary");
    expect(driver).toHaveAttribute("aria-checked", "false");
  });

  it("single: arrow keys move and select, with one tab stop", async () => {
    render(<OptionHarness />);
    await userEvent.tab();
    expect(screen.getByRole("radio", { name: /CDL driver/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /Yard spotter/ })).toHaveFocus();
    expect(screen.getByRole("radio", { name: /Yard spotter/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("radio", { name: /Mechanic/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /CDL driver/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.tab();
    expect(document.activeElement?.getAttribute("role")).not.toBe("radio");
  });

  it("multiple: toggles checkboxes, keeping selection order", async () => {
    const onChange = vi.fn();
    render(<OptionHarness multiple onChange={onChange} />);
    const group = screen.getByRole("group", { name: "What work do you do?" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(3);

    await userEvent.click(screen.getByRole("checkbox", { name: /Yard spotter/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /CDL driver/ }));
    expect(onChange).toHaveBeenLastCalledWith(["yard_spotter", "cdl_driver"]);
    expect(screen.getByRole("checkbox", { name: /Yard spotter/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await userEvent.click(screen.getByRole("checkbox", { name: /Yard spotter/ }));
    expect(onChange).toHaveBeenLastCalledWith(["cdl_driver"]);
  });

  it("shows one error under the group and never red borders on the cards", () => {
    render(<OptionHarness multiple error="Pick at least one kind of work" />);
    const group = screen.getByRole("group", { name: "What work do you do?" });
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Pick at least one kind of work");
    expect(error.querySelector("svg")).not.toBeNull();
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAttribute("aria-describedby", error.id);
    for (const card of within(group).getAllByRole("checkbox")) {
      expect(card.className).not.toMatch(/destructive/);
    }
  });

  it("has no error wiring when valid and never uses orange for selection", async () => {
    render(<OptionHarness />);
    const group = screen.getByRole("radiogroup");
    expect(group).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Mechanic/ }));
    const card = screen.getByRole("radio", { name: /Mechanic/ });
    expect(card.className).not.toMatch(/(border|bg|ring)-primary\b/);
  });

  it("can be disabled", async () => {
    const onChange = vi.fn();
    render(
      <OptionGroup
        label="Work"
        options={WORK_TYPE_OPTIONS}
        value={undefined}
        onChange={onChange}
        disabled
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /Mechanic/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: /Mechanic/ })).toBeDisabled();
  });

  it("supports the tile layout for short labels in a grid", () => {
    render(
      <OptionGroup
        label="Letters"
        options={[
          { value: "H", label: "H", description: "Hazmat", icon: Truck },
          { value: "N", label: "N", description: "Tank", icon: Wrench },
        ]}
        value={undefined}
        onChange={vi.fn()}
        columns={2}
        layout="tile"
      />,
    );
    expect(screen.getByRole("radio", { name: /^H/ })).toHaveClass("flex-col");
    expect(screen.getByRole("radiogroup").querySelector(".grid")).toHaveClass("grid-cols-2");
  });
});

const DISTANCE = [
  { value: 10, label: "10 miles" },
  { value: 25, label: "25 miles" },
  { value: 50, label: "50 miles" },
];

function DistanceHarness({ onChange = vi.fn() }: { onChange?: (value: number) => void }) {
  const [value, setValue] = useState<number>();
  return (
    <ChipGroup
      label="How far will you travel?"
      options={DISTANCE}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function CertHarness({
  onChange = vi.fn(),
  max,
}: {
  onChange?: (v: string[]) => void;
  max?: number;
}) {
  const [value, setValue] = useState<string[]>(["TWIC"]);
  return (
    <ChipGroup
      multiple
      label="Certifications"
      options={[
        { value: "Forklift", label: "Forklift" },
        { value: "TWIC", label: "TWIC" },
      ]}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      custom={{
        label: "Add another",
        fieldLabel: "Other certification",
        helper: "Press Add to keep it.",
        maxLength: 60,
        max,
      }}
    />
  );
}

describe("ChipGroup", () => {
  it("chips are 48px, 4px corners, aria-pressed, with a leading check when selected", async () => {
    const onChange = vi.fn();
    render(<DistanceHarness onChange={onChange} />);
    const chip = screen.getByRole("button", { name: "25 miles" });
    expect(chip).toHaveClass("h-target", "rounded-chip");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip.querySelector("svg")).toBeNull();

    await userEvent.click(chip);
    expect(onChange).toHaveBeenCalledWith(25);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    for (const className of SELECTED) expect(chip).toHaveClass(className);
    expect(chip.querySelector("svg")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "50 miles" }));
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("multi-select toggles presets and accepts custom values through Add another", async () => {
    const onChange = vi.fn();
    render(<CertHarness onChange={onChange} />);
    expect(screen.getByRole("button", { name: "TWIC" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Other certification")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add another" }));
    const field = screen.getByLabelText("Other certification");
    await userEvent.type(field, "Hazmat awareness{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["TWIC", "Hazmat awareness"]);
    expect(screen.getByRole("button", { name: "Hazmat awareness, remove" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(field).toHaveValue("");

    // Typing a preset or a duplicate selects or ignores it instead of adding a copy.
    await userEvent.type(field, "forklift");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).toHaveBeenLastCalledWith(["TWIC", "Hazmat awareness", "Forklift"]);
    await userEvent.type(field, "twic{Enter}");
    expect(screen.getAllByRole("button", { name: /TWIC/ })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Hazmat awareness, remove" }));
    expect(onChange).toHaveBeenLastCalledWith(["TWIC", "Forklift"]);
  });

  it("Enter in the custom field does not submit the form, and Add is disabled when empty", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <CertHarness />
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add another" }));
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Other certification"), "  {Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("stops adding at the limit", async () => {
    render(<CertHarness max={1} />);
    expect(screen.getByRole("button", { name: "Add another" })).toBeDisabled();
  });

  it("shows an error under the group", () => {
    render(
      <ChipGroup
        label="Distance"
        options={DISTANCE}
        value={undefined}
        onChange={vi.fn()}
        error="Pick how far you will travel"
      />,
    );
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Pick how far you will travel");
    expect(screen.getByRole("group", { name: "Distance" })).toHaveAttribute(
      "aria-describedby",
      error.id,
    );
  });
});

function StepperHarness({ initial = null }: { initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <Stepper label="Exact years" value={value} onChange={setValue} min={0} max={60} unit="years" />
  );
}

describe("Stepper", () => {
  it("has 56px buttons, a typed value and a unit", async () => {
    render(<StepperHarness initial={4} />);
    const less = screen.getByRole("button", { name: "One year less" });
    const more = screen.getByRole("button", { name: "One year more" });
    expect(less).toHaveClass("size-target-lg");
    expect(more).toHaveClass("size-target-lg");
    expect(screen.getByText("years")).toBeInTheDocument();
    expect(screen.getByLabelText("Exact years")).toHaveValue("4");

    await userEvent.click(more);
    expect(screen.getByLabelText("Exact years")).toHaveValue("5");
    await userEvent.click(less);
    await userEvent.click(less);
    expect(screen.getByLabelText("Exact years")).toHaveValue("3");
  });

  it("enforces and explains the limits", async () => {
    render(<StepperHarness initial={59} />);
    await userEvent.click(screen.getByRole("button", { name: "One year more" }));
    expect(screen.getByLabelText("Exact years")).toHaveValue("60");
    expect(screen.getByRole("button", { name: "One year more" })).toBeDisabled();
    expect(screen.getByText("60 is the highest you can pick")).toBeInTheDocument();

    const field = screen.getByLabelText("Exact years");
    await userEvent.clear(field);
    await userEvent.type(field, "99");
    await userEvent.tab();
    expect(field).toHaveValue("60");
  });

  it("starts empty, plus picks the minimum, typing letters is ignored and blank clears", async () => {
    render(<StepperHarness />);
    const field = screen.getByLabelText("Exact years");
    expect(field).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "One year more" }));
    expect(field).toHaveValue("0");
    expect(screen.getByRole("button", { name: "One year less" })).toBeDisabled();
    expect(screen.getByText("0 is the lowest you can pick")).toBeInTheDocument();

    await userEvent.clear(field);
    await userEvent.type(field, "1a2");
    expect(field).toHaveValue("12");
    await userEvent.clear(field);
    await userEvent.tab();
    expect(field).toHaveValue("");
  });
});

function ConsentHarness({ error }: { error?: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <ConsentCard
      id="sms"
      checked={checked}
      onCheckedChange={setChecked}
      text="I agree to texts."
      error={error}
    >
      <a href="/sms-terms">SMS Terms</a>
    </ConsentCard>
  );
}

describe("ConsentCard", () => {
  it("shows the full text, the whole card toggles the 24px box, and checked turns graphite", async () => {
    render(<ConsentHarness />);
    const box = screen.getByRole("checkbox", { name: /I agree to texts/ });
    expect(box).toHaveClass("size-6", "rounded-badge");
    expect(box).not.toBeChecked();
    const card = box.closest("label")!;
    for (const className of UNSELECTED) expect(card).toHaveClass(className);

    await userEvent.click(screen.getByText("I agree to texts."));
    expect(box).toBeChecked();
    expect(box).toHaveClass("data-checked:bg-selection");
    for (const className of SELECTED) expect(card).toHaveClass(className);
    expect(screen.getByRole("link", { name: "SMS Terms" })).toBeInTheDocument();
  });

  it("links an error to the box", () => {
    render(<ConsentHarness error="Tap the box to agree before you finish" />);
    const box = screen.getByRole("checkbox");
    const error = screen.getByRole("alert");
    expect(error).toHaveTextContent("Tap the box to agree before you finish");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAttribute("aria-describedby", error.id);
  });
});

describe("CheckBadge, InlineNote, Badge, StatusBadge", () => {
  it("the check badge is the orange 20px square with a check", () => {
    const { container } = render(<CheckBadge />);
    const badge = container.querySelector("[data-slot=check-badge]")!;
    expect(badge).toHaveClass("size-5", "bg-primary", "text-primary-foreground");
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(badge.querySelector("svg")).not.toBeNull();
  });

  it.each([
    ["info", "bg-info-subtle"],
    ["warning", "bg-warning-subtle"],
    ["success", "bg-success-subtle"],
    ["error", "bg-destructive-subtle"],
  ] as const)("InlineNote %s has an icon and a subtle fill", (variant, className) => {
    render(
      <InlineNote variant={variant} role="note">
        Note text
      </InlineNote>,
    );
    const note = screen.getByRole("note");
    expect(note).toHaveClass(className, "rounded-card");
    expect(note).toHaveAttribute("data-variant", variant);
    expect(note.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(note).toHaveTextContent("Note text");
  });

  it("badges are rectangular with a status rule", () => {
    render(
      <Badge variant="success" size="lg">
        Approved
      </Badge>,
    );
    expect(screen.getByText("Approved")).toHaveClass("rounded-badge", "border-success", "h-10");
  });

  it("StatusBadge offers a large size", () => {
    render(<StatusBadge status="approved" size="lg" />);
    expect(screen.getByText("Approved")).toHaveClass("h-10", "bg-success-subtle");
  });
});
