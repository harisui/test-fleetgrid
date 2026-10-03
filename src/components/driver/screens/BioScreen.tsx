"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { ScreenHelper, ScreenQuestion } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { FormField } from "@/components/shared/FormField";
import { Textarea } from "@/components/ui/textarea";
import { BIO_MAX_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { bioScreenSchema } from "@/lib/validation/onboarding.schema";

function BioFields({ showQuestion, question }: ScreenFieldsProps) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  const length = (useWatch({ control, name: "bio" }) ?? "").length;
  const over = length > BIO_MAX_LENGTH;

  return (
    <>
      <ScreenQuestion show={showQuestion}>{question}</ScreenQuestion>
      <FormField
        label="About you"
        error={errors.bio?.message}
        description={
          <span className="flex justify-between gap-2">
            <span>Optional. Carriers see this with your card.</span>
            <span
              aria-live="polite"
              className={cn("tabular-nums", over && "font-semibold text-destructive")}
            >
              {length} / {BIO_MAX_LENGTH}
            </span>
          </span>
        }
      >
        <Textarea
          {...register("bio")}
          rows={5}
          placeholder="For example: 12 years on flatbed and reefer. Clean record. Can start same day."
        />
      </FormField>
      <ScreenHelper>Keep it short. A few lines is plenty.</ScreenHelper>
    </>
  );
}

export const bioScreen: ScreenDefinition = {
  id: "bio",
  fields: ["bio"],
  schema: () => bioScreenSchema,
  defaults: (driver) => ({ bio: driver?.bio ?? "" }),
  Fields: BioFields,
};
