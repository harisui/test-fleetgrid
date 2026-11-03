"use client";

import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { FormField } from "@/components/shared/FormField";
import { SelectInput } from "@/components/shared/SelectInput";
import { US_STATE_OPTIONS } from "@/lib/constants";

/**
 * "CDL state" (CR-5): the state that issued the CDL, from the 50 states and DC, in the theme's
 * dropdown. On the lead (default Texas), the one-time question and the profile.
 */
export function CdlStateField<T extends FieldValues>({
  control,
  name,
  error,
  label = "CDL state",
  disabled,
}: {
  control: Control<T>;
  name: Path<T>;
  error?: string;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FormField label={label} description="The state on your CDL card." error={error} errorIcon={false} required>
          <SelectInput
            value={(field.value as string | undefined) ?? ""}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            options={US_STATE_OPTIONS}
            placeholder="Pick a state"
            disabled={disabled}
            aria-required
          />
        </FormField>
      )}
    />
  );
}
