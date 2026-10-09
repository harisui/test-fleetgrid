"use client";

import { useEffect, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { ScreenQuestion } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ZipField } from "@/components/driver/ZipField";
import { InlineNote } from "@/components/shared/InlineNote";
import { fiveDigits, useZipLookup, type ZipPlace } from "@/hooks/useZipLookup";
import { OUT_OF_AREA_NOTE } from "@/lib/launch";
import { zipScreenSchema } from "@/lib/validation/onboarding.schema";
import type { Driver } from "@/types/domain";

function savedPlace(driver: Driver | null): ZipPlace | null {
  return driver?.zip && driver.city && driver.state
    ? { zip: driver.zip, city: driver.city, state: driver.state }
    : null;
}

/**
 * The ZIP alone is typed. City and state come from the dataset and show as one read-only
 * line; a ZIP the dataset does not know is an error and holds Next.
 */
function ZipFields({ question, driver }: ScreenFieldsProps) {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  const zipValue = useWatch({ control, name: "zip" });
  const saved = useMemo(() => savedPlace(driver), [driver]);
  const lookup = useZipLookup(zipValue, saved);
  const city = lookup.place?.city ?? "";
  const state = lookup.place?.state ?? "";

  // Mirror the dataset's answer into the form, so the flow can hold Next until the ZIP is known.
  useEffect(() => {
    if (lookup.status === "idle" || lookup.status === "pending") return;
    setValue("city", city, { shouldDirty: true });
    setValue("state", state, { shouldDirty: true });
  }, [lookup.status, city, state, setValue]);

  // Information, not a warning: the sign-up goes on exactly as before.
  const outOfArea = lookup.status === "found" && lookup.inServiceArea === false;

  return (
    <>
      <ScreenQuestion>{question}</ScreenQuestion>
      {outOfArea && (
        <InlineNote variant="info" data-slot="launch-area-note">
          {OUT_OF_AREA_NOTE}
        </InlineNote>
      )}
      <ZipField input={register("zip")} lookup={lookup} error={errors.zip?.message} />
    </>
  );
}

export const zipScreen: ScreenDefinition = {
  id: "zip",
  fields: ["zip"],
  schema: () => zipScreenSchema,
  defaults: (driver) => ({
    zip: driver?.zip ?? "",
    city: driver?.city ?? "",
    state: driver?.state ?? "",
  }),
  Fields: ZipFields,
  // Five digits typed and no place for them: the dataset does not know the ZIP.
  blocked: (values) => fiveDigits(values.zip) !== null && !values.state,
};
