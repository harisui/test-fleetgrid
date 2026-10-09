"use client";

import { useFormContext } from "react-hook-form";
import { ScreenQuestion } from "@/components/driver/screens/common";
import type { ScreenDefinition, ScreenFieldsProps } from "@/components/driver/screens/types";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { nameScreenSchema } from "@/lib/validation/onboarding.schema";
import type { OnboardingFormValues } from "@/components/driver/screens/types";

function NameFields({ question }: ScreenFieldsProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenQuestion>{question}</ScreenQuestion>
      <FormField
        label="Full name"
        description="As it appears on your license."
        error={errors.fullName?.message}
      >
        <Input {...register("fullName")} autoComplete="name" enterKeyHint="next" />
      </FormField>
    </>
  );
}

export const nameScreen: ScreenDefinition = {
  id: "name",
  fields: ["fullName"],
  schema: () => nameScreenSchema,
  defaults: (driver) => ({ fullName: driver?.fullName ?? "" }),
  Fields: NameFields,
};
