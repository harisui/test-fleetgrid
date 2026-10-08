"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import type { ZipLookupState, ZipLookupStatus } from "@/hooks/useZipLookup";
import { ZIP_UNKNOWN_MESSAGE } from "@/lib/validation/onboarding.schema";

const HELPERS: Record<ZipLookupStatus, string> = {
  idle: "5 digits, like 60601.",
  pending: "5 digits, like 60601.",
  found: "City and state filled in from your ZIP.",
  missing: "",
};

interface ZipFieldProps {
  /** The ZIP control, from react-hook-form's `register`. */
  input: UseFormRegisterReturn;
  lookup: ZipLookupState;
  /** The schema's own error, which wins over the lookup's. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * The ZIP code field with the city and state the dataset gives it, as one read-only line.
 * A ZIP the dataset does not know is an error on the field. The same field serves the
 * onboarding screen and the profile editor, so the card's location always comes from the
 * dataset, never from typing.
 */
export function ZipField({ input, lookup, error, required, disabled }: ZipFieldProps) {
  const shownError = error ?? (lookup.status === "missing" ? ZIP_UNKNOWN_MESSAGE : undefined);
  return (
    <>
      <FormField
        label="ZIP code"
        description={HELPERS[lookup.status]}
        error={shownError}
        success={lookup.status === "found" && !error}
        required={required}
      >
        <Input
          {...input}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
          placeholder="60601"
          enterKeyHint="next"
          disabled={disabled}
        />
      </FormField>
      {lookup.place && (
        <p data-slot="zip-place" className="text-label leading-label font-semibold">
          <span className="sr-only">City and state: </span>
          {lookup.place.city}, {lookup.place.state}
        </p>
      )}
    </>
  );
}
