"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ChipGroup } from "@/components/shared/ChipGroup";
import { OptionGroup } from "@/components/shared/OptionGroup";
import {
  EQUIPMENT_CHIPS,
  TRANSMISSION_OPTIONS,
  TRANSMISSION_QUESTION,
} from "@/lib/onboarding/options";
import { equipmentScreenSchema } from "@/lib/validation/onboarding.schema";

/** CDL drivers only: the equipment they run, and whether they can drive a manual. */
function EquipmentFields({ showQuestion, question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenHelper>Pick everything you have pulled or driven.</ScreenHelper>
      <Controller
        control={control}
        name="equipmentTypes"
        render={({ field }) => (
          <ChipGroup
            multiple
            label={question}
            labelHidden={!showQuestion}
            options={EQUIPMENT_CHIPS}
            value={field.value ?? []}
            onChange={field.onChange}
            error={errors.equipmentTypes?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="transmission"
        render={({ field }) => (
          <OptionGroup
            label={TRANSMISSION_QUESTION}
            options={TRANSMISSION_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            error={errors.transmission?.message}
            columns={2}
            layout="tile"
          />
        )}
      />
    </>
  );
}

export const equipmentScreen: ScreenDefinition = {
  id: "equipment",
  fields: ["equipmentTypes", "transmission"],
  schema: () => equipmentScreenSchema,
  defaults: (driver) => ({
    equipmentTypes: driver?.equipmentTypes ?? [],
    transmission: driver?.transmission ?? undefined,
  }),
  Fields: EquipmentFields,
};
