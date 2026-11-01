"use client";

import { useState } from "react";
import { FormField } from "@/components/shared/FormField";
import { SelectInput, type SelectOption } from "@/components/shared/SelectInput";

/** The theme dropdown inside a plain GET form: the chosen value submits as `name`. */
export function FormSelect({
  name,
  label,
  options,
  initial,
}: {
  name: string;
  label: string;
  options: readonly SelectOption[];
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <FormField label={label} errorIcon={false}>
      <SelectInput name={name} value={value} onValueChange={setValue} options={options} />
    </FormField>
  );
}
