"use client";

import { CircleOff } from "lucide-react";
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { CdlIllustration } from "@/components/driver/CdlIllustration";
import { ScreenHelper } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { InlineNote } from "@/components/shared/InlineNote";
import { OptionCard } from "@/components/shared/OptionCard";
import { OptionGroup } from "@/components/shared/OptionGroup";
import {
  ENDORSEMENT_OPTIONS,
  ENDORSEMENT_X_NOTE,
  toggleEndorsement,
} from "@/lib/onboarding/options";
import { endorsementsScreenSchema } from "@/lib/validation/onboarding.schema";
import type { Endorsement } from "@/types/domain";

/** The one letter that differs between two selections. */
function toggledLetter(before: readonly Endorsement[], after: readonly Endorsement[]) {
  return (
    after.find((letter) => !before.includes(letter)) ??
    before.find((letter) => !after.includes(letter)) ??
    null
  );
}

function EndorsementsFields({ showQuestion, question, helper }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  const [noneChosen, setNoneChosen] = useState(false);

  return (
    <>
      <CdlIllustration />
      {helper && <ScreenHelper>{helper}</ScreenHelper>}
      <Controller
        control={control}
        name="endorsements"
        render={({ field }) => {
          const value: Endorsement[] = field.value ?? [];
          return (
            <>
              <OptionGroup
                multiple
                label={question}
                labelHidden={!showQuestion}
                options={ENDORSEMENT_OPTIONS}
                value={value}
                onChange={(next) => {
                  const letter = toggledLetter(value, next);
                  if (!letter) return;
                  setNoneChosen(false);
                  field.onChange(toggleEndorsement(value, letter));
                }}
                error={errors.endorsements?.message}
                columns={2}
                layout="tile"
              />
              <OptionCard
                label="None"
                description="No extra letters on my CDL"
                icon={CircleOff}
                role="checkbox"
                selected={noneChosen && value.length === 0}
                onSelect={() => {
                  setNoneChosen(true);
                  field.onChange([]);
                }}
              />
              {value.includes("X") && (
                <InlineNote variant="info" data-slot="x-note">
                  {ENDORSEMENT_X_NOTE}
                </InlineNote>
              )}
            </>
          );
        }}
      />
    </>
  );
}

export const endorsementsScreen: ScreenDefinition = {
  id: "endorsements",
  fields: ["endorsements"],
  schema: () => endorsementsScreenSchema,
  defaults: (driver) => ({ endorsements: driver?.endorsements ?? [] }),
  Fields: EndorsementsFields,
};
