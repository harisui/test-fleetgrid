"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ChipGroup } from "@/components/shared/ChipGroup";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { HEARD_FROM_CHIPS } from "@/lib/onboarding/options";
import {
  HEARD_FROM_OTHER_MAX_LENGTH,
  heardFromScreenSchema,
} from "@/lib/validation/onboarding.schema";

/**
 * "How did you hear about FleetGrid?" One tap, optional, so the flyers printed before the
 * QR codes still count. A short line appears for "Other". Next works without an answer.
 */
function HeardFromFields({ question, helper }: ScreenFieldsProps) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  const heardFrom = useWatch({ control, name: "heardFrom" });
  return (
    <>
      <Controller
        control={control}
        name="heardFrom"
        render={({ field }) => (
          <ChipGroup
            label={question}
            description={helper}
            options={HEARD_FROM_CHIPS}
            value={field.value ?? undefined}
            onChange={(value) => field.onChange(value === field.value ? null : value)}
            error={errors.heardFrom?.message}
          />
        )}
      />
      {heardFrom === "other" && (
        <FormField label="Where was that?" description="A few words." error={errors.heardFromOther?.message}>
          <Input {...register("heardFromOther")} maxLength={HEARD_FROM_OTHER_MAX_LENGTH} autoComplete="off" />
        </FormField>
      )}
    </>
  );
}

export const heardFromScreen: ScreenDefinition = {
  id: "heardFrom",
  fields: ["heardFrom", "heardFromOther"],
  schema: () => heardFromScreenSchema,
  defaults: (driver) => ({
    heardFrom: driver?.heardFrom ?? null,
    heardFromOther: driver?.heardFromOther ?? "",
  }),
  Fields: HeardFromFields,
  // The last screen shown when the lead already took the consent: the client's button.
  nextLabel: (_values, { driver }) => (driver?.smsOptIn ? "Find local shifts" : "Next"),
};
