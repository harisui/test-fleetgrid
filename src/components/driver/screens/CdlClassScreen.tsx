"use client";

import { Controller, useFormContext } from "react-hook-form";
import type { OnboardingFormValues, ScreenFieldsProps } from "@/components/driver/screens/types";
import { OptionGroup } from "@/components/shared/OptionGroup";
import { CDL_CLASS_OPTIONS } from "@/lib/onboarding/options";

/**
 * Class A or B (the launch scope), on the lead screen (LeadScreen.tsx). FleetGrid lists CDL
 * drivers only, so there is no "No CDL".
 */
export function CdlClassFields({ question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <Controller
      control={control}
      name="cdlClass"
      render={({ field }) => (
        <OptionGroup
          label={question}
          options={CDL_CLASS_OPTIONS}
          value={field.value}
          onChange={field.onChange}
          error={errors.cdlClass?.message}
        />
      )}
    />
  );
}
