"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { OptionGroup } from "@/components/shared/OptionGroup";
import { DRIVING_STYLE_OPTIONS } from "@/lib/onboarding/options";
import { drivingStyleScreenSchema } from "@/lib/validation/onboarding.schema";

/** CDL drivers only: the kinds of driving they do. */
function DrivingStyleFields({ showQuestion, question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenHelper>Pick all that apply.</ScreenHelper>
      <Controller
        control={control}
        name="drivingStyles"
        render={({ field }) => (
          <OptionGroup
            multiple
            label={question}
            labelHidden={!showQuestion}
            options={DRIVING_STYLE_OPTIONS}
            value={field.value ?? []}
            onChange={field.onChange}
            error={errors.drivingStyles?.message}
          />
        )}
      />
    </>
  );
}

export const drivingStyleScreen: ScreenDefinition = {
  id: "drivingStyle",
  fields: ["drivingStyles"],
  schema: () => drivingStyleScreenSchema,
  defaults: (driver) => ({ drivingStyles: driver?.drivingStyles ?? [] }),
  Fields: DrivingStyleFields,
};
