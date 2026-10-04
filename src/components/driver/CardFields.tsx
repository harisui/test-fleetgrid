"use client";

import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import { ChoiceGroup } from "@/components/shared/ChoiceGroup";
import { FormField } from "@/components/shared/FormField";
import { SelectInput } from "@/components/shared/SelectInput";
import { TagInput } from "@/components/shared/TagInput";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BIO_MAX_LENGTH,
  CERTIFICATION_MAX_LENGTH,
  CERTIFICATIONS_MAX_COUNT,
  SERVICE_RADIUS_MAX_MILES,
  SERVICE_RADIUS_MIN_MILES,
  US_STATE_OPTIONS,
  YEARS_EXPERIENCE_MAX,
} from "@/lib/constants";
import { CDL_CLASS_OPTIONS } from "@/lib/onboarding/options";
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_TYPES,
  ENDORSEMENT_LABELS,
  ENDORSEMENTS,
  OPERATOR_TYPE_LABELS,
  OPERATOR_TYPES,
} from "@/types/domain";

/**
 * Field groups of the qualification card. The onboarding steps and the profile editor both
 * render these, so a field looks and validates the same everywhere.
 */

interface GroupProps<T extends FieldValues> {
  control: Control<T>;
  register: UseFormRegister<T>;
  errorOf: (name: keyof T & string) => string | undefined;
  disabled?: boolean;
}

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

const OPERATOR_OPTIONS = options(OPERATOR_TYPES, OPERATOR_TYPE_LABELS);
// The same words as the onboarding cards, so the profile never describes a class differently.
const CDL_OPTIONS = CDL_CLASS_OPTIONS.map(({ value, label, description }) => ({
  value,
  label,
  description,
}));
const ENDORSEMENT_OPTIONS = options(ENDORSEMENTS, ENDORSEMENT_LABELS);
const AVAILABILITY_OPTIONS = options(AVAILABILITY_TYPES, AVAILABILITY_LABELS);

// The generic field names are fixed by the driver schemas. Path<T> keeps react-hook-form typed.
const field = <T extends FieldValues>(name: string) => name as Path<T>;

export function BasicsFields<T extends FieldValues>({
  control,
  register,
  errorOf,
  disabled,
}: GroupProps<T>) {
  return (
    <>
      <FormField label="Full name" error={errorOf("fullName")} required>
        <Input {...register(field<T>("fullName"))} autoComplete="name" disabled={disabled} />
      </FormField>

      <FormField label="City" error={errorOf("city")}>
        <Input {...register(field<T>("city"))} autoComplete="address-level2" disabled={disabled} />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <Controller
          control={control}
          name={field<T>("state")}
          render={({ field: input }) => (
            <FormField label="State" error={errorOf("state")} errorIcon={false} required>
              <SelectInput
                name={input.name}
                value={input.value ?? ""}
                onValueChange={input.onChange}
                onBlur={input.onBlur}
                options={US_STATE_OPTIONS}
                autoComplete="address-level1"
                disabled={disabled}
              />
            </FormField>
          )}
        />

        <FormField label="ZIP code" error={errorOf("zip")} required>
          <Input
            {...register(field<T>("zip"))}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            disabled={disabled}
          />
        </FormField>
      </div>

      <FormField
        label="Service radius (miles)"
        description={`How far you will travel for a shift, from ${SERVICE_RADIUS_MIN_MILES} to ${SERVICE_RADIUS_MAX_MILES} miles.`}
        error={errorOf("serviceRadiusMiles")}
        required
      >
        <Input
          {...register(field<T>("serviceRadiusMiles"))}
          type="number"
          inputMode="numeric"
          min={SERVICE_RADIUS_MIN_MILES}
          max={SERVICE_RADIUS_MAX_MILES}
          disabled={disabled}
        />
      </FormField>
    </>
  );
}

export function LicensesFields<T extends FieldValues>({
  control,
  register,
  errorOf,
  disabled,
  cdlClass,
}: GroupProps<T> & { /** Current CDL class, to show or hide endorsements. */ cdlClass: string }) {
  return (
    <>
      <Controller
        control={control}
        name={field<T>("operatorTypes")}
        render={({ field: input }) => (
          <ChoiceGroup
            multiple
            label="What work do you do?"
            description="Select all that apply."
            options={OPERATOR_OPTIONS}
            value={input.value ?? []}
            onChange={input.onChange}
            error={errorOf("operatorTypes")}
            disabled={disabled}
            required
          />
        )}
      />

      <Controller
        control={control}
        name={field<T>("cdlClass")}
        render={({ field: input }) => (
          <ChoiceGroup
            label="CDL class"
            options={CDL_OPTIONS}
            value={input.value}
            onChange={input.onChange}
            error={errorOf("cdlClass")}
            disabled={disabled}
            columns={2}
            required
          />
        )}
      />

      {cdlClass !== "none" && (
        <Controller
          control={control}
          name={field<T>("endorsements")}
          render={({ field: input }) => (
            <ChoiceGroup
              multiple
              label="Endorsements"
              description="Optional. Select all you hold."
              options={ENDORSEMENT_OPTIONS}
              value={input.value ?? []}
              onChange={input.onChange}
              error={errorOf("endorsements")}
              disabled={disabled}
            />
          )}
        />
      )}

      <FormField label="Years of experience" error={errorOf("yearsExperience")} required>
        <Input
          {...register(field<T>("yearsExperience"))}
          type="number"
          inputMode="numeric"
          min={0}
          max={YEARS_EXPERIENCE_MAX}
          disabled={disabled}
        />
      </FormField>

      <Controller
        control={control}
        name={field<T>("certifications")}
        render={({ field: input }) => (
          <TagInput
            label="Certifications"
            description="Optional. For example TWIC, OSHA 10, Forklift."
            placeholder="Type one and press Add"
            value={input.value ?? []}
            onChange={input.onChange}
            error={errorOf("certifications")}
            maxTags={CERTIFICATIONS_MAX_COUNT}
            maxLength={CERTIFICATION_MAX_LENGTH}
            disabled={disabled}
          />
        )}
      />
    </>
  );
}

export function AvailabilityFields<T extends FieldValues>({
  control,
  register,
  errorOf,
  disabled,
  bioLength,
}: GroupProps<T> & { /** Current bio length for the counter. */ bioLength: number }) {
  return (
    <>
      <Controller
        control={control}
        name={field<T>("availability")}
        render={({ field: input }) => (
          <ChoiceGroup
            multiple
            label="When can you work?"
            description="Select all that apply."
            options={AVAILABILITY_OPTIONS}
            value={input.value ?? []}
            onChange={input.onChange}
            error={errorOf("availability")}
            disabled={disabled}
            columns={2}
            required
          />
        )}
      />

      <FormField
        label="About you"
        description={
          <span className="flex justify-between gap-2">
            <span>Optional. A few lines carriers will read.</span>
            <span
              aria-live="polite"
              className={bioLength > BIO_MAX_LENGTH ? "font-semibold text-destructive" : undefined}
            >
              {bioLength}/{BIO_MAX_LENGTH}
            </span>
          </span>
        }
        error={errorOf("bio")}
      >
        <Textarea {...register(field<T>("bio"))} rows={5} disabled={disabled} />
      </FormField>
    </>
  );
}
