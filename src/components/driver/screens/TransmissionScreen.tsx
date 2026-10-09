"use client";

import { Controller, useFormContext } from "react-hook-form";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { OptionGroup } from "@/components/shared/OptionGroup";
import { TRANSMISSION_OPTIONS } from "@/lib/onboarding/options";
import { transmissionScreenSchema } from "@/lib/validation/onboarding.schema";

/** Whether the driver can drive a manual: two cards, one tap. */
function TransmissionFields({ question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <Controller
      control={control}
      name="transmission"
      render={({ field }) => (
        <OptionGroup
          label={question}
          options={TRANSMISSION_OPTIONS}
          value={field.value}
          onChange={field.onChange}
          error={errors.transmission?.message}
          columns={2}
          layout="tile"
        />
      )}
    />
  );
}

export const transmissionScreen: ScreenDefinition = {
  id: "transmission",
  fields: ["transmission"],
  schema: () => transmissionScreenSchema,
  defaults: (driver) => ({ transmission: driver?.transmission ?? undefined }),
  Fields: TransmissionFields,
};
