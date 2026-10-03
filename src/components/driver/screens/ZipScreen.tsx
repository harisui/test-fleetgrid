"use client";

import { useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { ScreenHelper, ScreenQuestion } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { FormField } from "@/components/shared/FormField";
import { SelectInput } from "@/components/shared/SelectInput";
import { Input } from "@/components/ui/input";
import { US_STATE_OPTIONS } from "@/lib/constants";
import { normalizeZip, zipScreenSchema } from "@/lib/validation/onboarding.schema";
import { lookupZipAction } from "@/server/actions/driver.actions";

const LOOKUP_DELAY_MS = 250;

interface LookupResult {
  zip: string;
  found: boolean;
}

const HELPERS = {
  idle: "5 digits, like 60601.",
  found: "City and state filled in from your ZIP.",
  missing: "We could not find that ZIP. Enter your city and state.",
} as const;

function fiveDigits(value: unknown): string | null {
  const normalized = normalizeZip(value);
  return typeof normalized === "string" && /^\d{5}$/.test(normalized) ? normalized : null;
}

function ZipFields({ showQuestion, question }: ScreenFieldsProps) {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  const zip = fiveDigits(useWatch({ control, name: "zip" }));
  const [result, setResult] = useState<LookupResult | null>(null);

  // Fill in the city and state as soon as five digits are typed. Later edits win.
  useEffect(() => {
    if (!zip) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const lookup = await lookupZipAction(zip);
      if (cancelled) return;
      if (lookup.ok && lookup.data) {
        setValue("city", lookup.data.city, { shouldDirty: true, shouldValidate: true });
        setValue("state", lookup.data.state, { shouldDirty: true, shouldValidate: true });
      }
      setResult({ zip, found: lookup.ok && lookup.data !== null });
    }, LOOKUP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [zip, setValue]);

  const lookup: keyof typeof HELPERS =
    zip && result?.zip === zip ? (result.found ? "found" : "missing") : "idle";

  return (
    <>
      <ScreenQuestion show={showQuestion}>{question}</ScreenQuestion>
      <FormField
        label="ZIP code"
        description={HELPERS[lookup]}
        error={errors.zip?.message}
        success={lookup === "found"}
      >
        <Input
          {...register("zip")}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          placeholder="60601"
          enterKeyHint="next"
        />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="City" error={errors.city?.message}>
          <Input {...register("city")} autoComplete="address-level2" enterKeyHint="next" />
        </FormField>
        <Controller
          control={control}
          name="state"
          render={({ field }) => (
            <FormField label="State" error={errors.state?.message} errorIcon={false}>
              <SelectInput
                name={field.name}
                value={field.value ?? ""}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                options={US_STATE_OPTIONS}
                autoComplete="address-level1"
              />
            </FormField>
          )}
        />
      </div>
      <ScreenHelper>City and state fill in from your ZIP. You can change them.</ScreenHelper>
    </>
  );
}

export const zipScreen: ScreenDefinition = {
  id: "zip",
  fields: ["zip", "city", "state"],
  schema: () => zipScreenSchema,
  defaults: (driver) => ({
    zip: driver?.zip ?? "",
    city: driver?.city ?? "",
    state: driver?.state ?? "",
  }),
  Fields: ZipFields,
};
