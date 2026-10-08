"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { InlineNote } from "@/components/shared/InlineNote";
import { OptionGroup } from "@/components/shared/OptionGroup";
import { CDL_CLASS_OPTIONS } from "@/lib/onboarding/options";
import { stepNumber } from "@/lib/onboarding/steps";
import {
  CDL_CONFLICT_MESSAGE,
  cdlClassScreenSchemaFor,
  hasCdlConflict,
} from "@/lib/validation/onboarding.schema";

function CdlClassFields({ showQuestion, question, driver }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  const cdlClass = useWatch({ control, name: "cdlClass" });
  // On wide screens the work type may be on the same page; use what is being edited.
  const operatorTypes = useWatch({ control, name: "operatorTypes" }) ?? driver?.operatorTypes ?? [];
  const conflict = hasCdlConflict(operatorTypes, cdlClass);

  return (
    <>
      <Controller
        control={control}
        name="cdlClass"
        render={({ field }) => (
          <OptionGroup
            label={question}
            labelHidden={!showQuestion}
            options={CDL_CLASS_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            error={conflict ? undefined : errors.cdlClass?.message}
          />
        )}
      />
      {conflict && (
        <InlineNote variant="warning" role="alert" data-slot="cdl-conflict">
          {CDL_CONFLICT_MESSAGE}
        </InlineNote>
      )}
    </>
  );
}

export const cdlClassScreen: ScreenDefinition = {
  id: "cdlClass",
  fields: ["cdlClass"],
  schema: ({ driver }) => cdlClassScreenSchemaFor(driver?.operatorTypes ?? []),
  defaults: (driver) => ({
    // "none" is the database default, not an answer. Nothing is selected until the driver picks.
    cdlClass:
      driver && driver.onboardingStep > stepNumber("cdlClass") ? driver.cdlClass : undefined,
  }),
  Fields: CdlClassFields,
  blocked: (values, { driver }) =>
    hasCdlConflict(values.operatorTypes ?? driver?.operatorTypes ?? [], values.cdlClass),
};
