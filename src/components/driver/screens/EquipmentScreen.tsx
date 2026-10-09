"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ChipGroup } from "@/components/shared/ChipGroup";
import { EQUIPMENT_CHIPS } from "@/lib/onboarding/options";
import { equipmentScreenSchema } from "@/lib/validation/onboarding.schema";

/** The equipment the driver runs. Chips, pick all that apply. */
function EquipmentFields({ question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <Controller
        control={control}
        name="equipmentTypes"
        render={({ field }) => (
          <ChipGroup
            multiple
            label={question}
            options={EQUIPMENT_CHIPS}
            value={field.value ?? []}
            onChange={field.onChange}
            error={errors.equipmentTypes?.message}
          />
        )}
      />
      <ScreenHelper>Pick everything you have pulled or driven.</ScreenHelper>
    </>
  );
}

export const equipmentScreen: ScreenDefinition = {
  id: "equipment",
  fields: ["equipmentTypes"],
  schema: () => equipmentScreenSchema,
  defaults: (driver) => ({ equipmentTypes: driver?.equipmentTypes ?? [] }),
  Fields: EquipmentFields,
};
