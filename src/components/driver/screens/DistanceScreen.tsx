"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ChipGroup } from "@/components/shared/ChipGroup";
import { DISTANCE_CHIPS } from "@/lib/onboarding/options";
import { stepNumber } from "@/lib/onboarding/steps";
import { distanceScreenSchema } from "@/lib/validation/onboarding.schema";

function DistanceFields({ showQuestion, question, driver }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  const from =
    driver?.city && driver.state && driver.zip
      ? `From ${driver.city}, ${driver.state} ${driver.zip}. `
      : "";
  return (
    <>
      {/* Shifts are matched by state (Milestone 3); this answer is information for carriers. */}
      <ScreenHelper>{from}Tells carriers how far you&apos;re willing to go for work.</ScreenHelper>
      <Controller
        control={control}
        name="serviceRadiusMiles"
        render={({ field }) => (
          <ChipGroup
            label={question}
            labelHidden={!showQuestion}
            options={DISTANCE_CHIPS}
            value={field.value}
            onChange={field.onChange}
            error={errors.serviceRadiusMiles?.message}
          />
        )}
      />
    </>
  );
}

export const distanceScreen: ScreenDefinition = {
  id: "distance",
  fields: ["serviceRadiusMiles"],
  schema: () => distanceScreenSchema,
  defaults: (driver) => ({
    // A new card holds the database default; the driver must still pick.
    serviceRadiusMiles:
      driver && driver.onboardingStep > stepNumber("distance")
        ? driver.serviceRadiusMiles
        : undefined,
  }),
  Fields: DistanceFields,
};
