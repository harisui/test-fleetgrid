import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormField } from "@/components/shared/FormField";
import { SelectInput } from "@/components/shared/SelectInput";

const OPTIONS = [
  { value: "TX", label: "Texas" },
  { value: "OK", label: "Oklahoma" },
];

describe("SelectInput", () => {
  it("is a 56px Workshop trigger that shows the placeholder until a value is picked", () => {
    render(<SelectInput value="" onValueChange={vi.fn()} options={OPTIONS} placeholder="Pick" />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("Pick");
    expect(trigger).toHaveClass("h-target-lg", "border-2", "rounded-field");
  });

  it("shows the label of the chosen value", () => {
    render(<SelectInput value="OK" onValueChange={vi.fn()} options={OPTIONS} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Oklahoma");
  });

  it("opens a list of options and reports the pick, marking the current one", async () => {
    const onValueChange = vi.fn();
    render(<SelectInput value="TX" onValueChange={onValueChange} options={OPTIONS} />);
    await userEvent.click(screen.getByRole("combobox"));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Texas", "Oklahoma"]);
    expect(screen.getByRole("option", { name: "Texas" })).toHaveAttribute("data-state", "checked");
    await userEvent.click(screen.getByRole("option", { name: "Oklahoma" }));
    expect(onValueChange).toHaveBeenCalledWith("OK");
  });

  it("takes the label, error and description wiring from FormField", () => {
    render(
      <FormField label="State" error="Select your state" errorIcon={false} required>
        <SelectInput value="" onValueChange={vi.fn()} options={OPTIONS} name="state" />
      </FormField>,
    );
    const trigger = screen.getByRole("combobox", { name: /State/ });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(trigger).toHaveAttribute("aria-required", "true");
    expect(trigger).toHaveAttribute("aria-describedby", screen.getByRole("alert").id);
  });

  it("can be disabled", () => {
    render(<SelectInput value="" onValueChange={vi.fn()} options={OPTIONS} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
