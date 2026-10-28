"use client";

import { useFormContext } from "react-hook-form";
import { ScreenQuestion } from "@/components/driver/screens/common";
import type { OnboardingFormValues, ScreenFieldsProps } from "@/components/driver/screens/types";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";

/** The name, on the lead screen (LeadScreen.tsx). */
export function NameFields({ question }: ScreenFieldsProps) {
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
