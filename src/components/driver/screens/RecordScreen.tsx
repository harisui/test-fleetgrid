"use client";

import { Controller, useFormContext } from "react-hook-form";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ChipGroup } from "@/components/shared/ChipGroup";
import { MVR_CHIPS, MVR_HELPER } from "@/lib/onboarding/options";
import { recordScreenSchema } from "@/lib/validation/onboarding.schema";

/** The MVR in three levels, one tap. The helper says what counts as major. */
function RecordFields({ question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <Controller
      control={control}
      name="mvrStatus"
      render={({ field }) => (
        <ChipGroup
          label={question}
          description={MVR_HELPER}
          options={MVR_CHIPS}
          value={field.value}
          onChange={field.onChange}
          error={errors.mvrStatus?.message}
        />
      )}
    />
  );
}

export const recordScreen: ScreenDefinition = {
  id: "record",
  fields: ["mvrStatus"],
  schema: () => recordScreenSchema,
  defaults: (driver) => ({ mvrStatus: driver?.mvrStatus ?? undefined }),
  Fields: RecordFields,
};
