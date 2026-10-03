"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { OptionGroup } from "@/components/shared/OptionGroup";
import { AVAILABILITY_OPTIONS } from "@/lib/onboarding/options";
import { availabilityScreenSchema } from "@/lib/validation/onboarding.schema";

function AvailabilityFields({ showQuestion, question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenHelper>Pick all that apply.</ScreenHelper>
      <Controller
        control={control}
        name="availability"
        render={({ field }) => (
          <OptionGroup
            multiple
            label={question}
            labelHidden={!showQuestion}
            options={AVAILABILITY_OPTIONS}
            value={field.value ?? []}
            onChange={field.onChange}
            error={errors.availability?.message}
          />
        )}
      />
    </>
  );
}

export const availabilityScreen: ScreenDefinition = {
  id: "availability",
  fields: ["availability"],
  schema: () => availabilityScreenSchema,
  defaults: (driver) => ({ availability: driver?.availability ?? [] }),
  Fields: AvailabilityFields,
};
