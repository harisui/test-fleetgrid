"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type DefaultValues, type FieldValues, type Path } from "react-hook-form";
import type { z } from "zod";
import type { Result } from "@/server/errors/AppError";

/**
 * Shared form wiring for the onboarding steps and the profile editor:
 * client validation with the same zod schema the server uses, a pending flag, and server
 * errors mapped back onto their fields.
 */
export function useStepForm<TInput extends FieldValues, TOutput>(options: {
  schema: z.ZodType<TOutput, TInput>;
  defaultValues: DefaultValues<TInput>;
  /** Sends validated values to the server. */
  onSave: (values: TOutput) => Promise<Result<unknown>>;
}) {
  const { schema, defaultValues, onSave } = options;
  const [formError, setFormError] = useState<string>();
  const form = useForm<TInput, unknown, TOutput>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const submit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await onSave(values);
    if (result.ok) return;

    const fieldErrors = result.error.fieldErrors ?? {};
    const known = Object.keys(form.getValues());
    let mapped = false;
    for (const [field, message] of Object.entries(fieldErrors)) {
      // "certifications.0" belongs to the "certifications" control.
      const name = field.split(".")[0];
      if (known.includes(name)) {
        form.setError(name as Path<TInput>, { message });
        mapped = true;
      }
    }
    if (!mapped) setFormError(result.error.message);
  });

  return {
    form,
    submit,
    pending: form.formState.isSubmitting,
    formError,
    /** First error message for a field, including nested array items. */
    errorOf(name: keyof TInput & string): string | undefined {
      const error = form.formState.errors[name] as
        { message?: string; root?: { message?: string } } | { message?: string }[] | undefined;
      if (!error) return undefined;
      if (Array.isArray(error)) return error.find((item) => item?.message)?.message;
      return error.message ?? error.root?.message;
    },
  };
}
