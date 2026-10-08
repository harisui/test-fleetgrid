"use client";

import {
  Controller,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from "react-hook-form";
import { ZipField } from "@/components/driver/ZipField";
import { ChoiceGroup, type ChoiceOption } from "@/components/shared/ChoiceGroup";
import { FormField } from "@/components/shared/FormField";
import { TagInput } from "@/components/shared/TagInput";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useZipLookup, type ZipPlace } from "@/hooks/useZipLookup";
import {
  BIO_MAX_LENGTH,
  CERTIFICATION_MAX_LENGTH,
  CERTIFICATIONS_MAX_COUNT,
  SERVICE_RADIUS_MAX_MILES,
  SERVICE_RADIUS_MIN_MILES,
} from "@/lib/constants";
import {
  CARD_CHECKS,
  CDL_CLASS_OPTIONS,
  DRIVING_STYLE_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  EQUIPMENT_CHIPS,
  EXPERIENCE_CHIPS,
  experienceChipFor,
  TRANSMISSION_OPTIONS,
  TRANSMISSION_QUESTION,
  type CardCheck,
} from "@/lib/onboarding/options";
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

/** The same words as the onboarding cards, so the profile never describes a choice differently. */
const choices = <T extends string>(
  cards: readonly { value: T; label: string; description?: string }[],
): ChoiceOption<T>[] =>
  cards.map(({ value, label, description }) => ({ value, label, description }));

const OPERATOR_OPTIONS = options(OPERATOR_TYPES, OPERATOR_TYPE_LABELS);
const EMPLOYMENT_OPTIONS = choices(EMPLOYMENT_TYPE_OPTIONS);
const CDL_OPTIONS = choices(CDL_CLASS_OPTIONS);
const ENDORSEMENT_OPTIONS = options(ENDORSEMENTS, ENDORSEMENT_LABELS);
const DRIVING_OPTIONS = choices(DRIVING_STYLE_OPTIONS);
const TRANSMISSION_CHOICES = choices(TRANSMISSION_OPTIONS);
const EQUIPMENT_OPTIONS = choices(EQUIPMENT_CHIPS);
const AVAILABILITY_OPTIONS = options(AVAILABILITY_TYPES, AVAILABILITY_LABELS);
/** Choice values are strings; the years chips store numbers. */
const EXPERIENCE_OPTIONS = EXPERIENCE_CHIPS.map((chip) => ({
  value: String(chip.value),
  label: chip.label,
}));

// The generic field names are fixed by the driver schemas. Path<T> keeps react-hook-form typed.
const field = <T extends FieldValues>(name: string) => name as Path<T>;

/** The chip that holds a saved number of years, as a choice value. */
function experienceChoice(value: unknown): string | undefined {
  const years = typeof value === "number" ? value : Number(value);
  const chip = experienceChipFor(value === "" || value == null ? null : years);
  return chip === null ? undefined : String(chip);
}

export function BasicsFields<T extends FieldValues>({
  control,
  register,
  errorOf,
  disabled,
  place,
}: GroupProps<T> & {
  /** The saved ZIP with its city and state, shown until the ZIP changes. */ place: ZipPlace | null;
}) {
  const lookup = useZipLookup(useWatch({ control, name: field<T>("zip") }), place);
  return (
    <>
      <FormField label="Full name" error={errorOf("fullName")} required>
        <Input {...register(field<T>("fullName"))} autoComplete="name" disabled={disabled} />
      </FormField>

      <ZipField
        input={register(field<T>("zip"))}
        lookup={lookup}
        error={errorOf("zip")}
        disabled={disabled}
        required
      />

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
        name={field<T>("employmentType")}
        render={({ field: input }) => (
          <ChoiceGroup
            label="W-2 or 1099?"
            options={EMPLOYMENT_OPTIONS}
            value={input.value}
            onChange={input.onChange}
            error={errorOf("employmentType")}
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

      <Controller
        control={control}
        name={field<T>("yearsExperience")}
        render={({ field: input }) => (
          <ChoiceGroup
            label="Years of experience"
            options={EXPERIENCE_OPTIONS}
            value={experienceChoice(input.value)}
            onChange={(value) => input.onChange(Number(value))}
            error={errorOf("yearsExperience")}
            disabled={disabled}
            columns={2}
            required
          />
        )}
      />

      <Controller
        control={control}
        name={field<T>("certifications")}
        render={({ field: input }) => (
          <TagInput
            label="Certifications"
            description="Optional. For example OSHA 10, Forklift."
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

/** One yes-or-no check of the card as a pair of choice cards. */
function CheckChoice<T extends FieldValues>({
  control,
  name,
  errorOf,
  disabled,
}: Pick<GroupProps<T>, "control" | "errorOf" | "disabled"> & { name: CardCheck }) {
  const check = CARD_CHECKS[name];
  return (
    <Controller
      control={control}
      name={field<T>(name)}
      render={({ field: input }) => (
        <ChoiceGroup
          label={check.question}
          options={[
            { value: "yes", label: check.yes },
            { value: "no", label: check.no },
          ]}
          value={input.value === true ? "yes" : input.value === false ? "no" : undefined}
          onChange={(value) => input.onChange(value === "yes")}
          error={errorOf(name as keyof T & string)}
          disabled={disabled}
          columns={2}
          required
        />
      )}
    />
  );
}

/**
 * Equipment and checks. Driving style, transmission, equipment, Clearinghouse and MVR are
 * CDL-driver questions and only show when the work includes CDL driving.
 */
export function ChecksFields<T extends FieldValues>({
  control,
  errorOf,
  disabled,
  cdlDriver,
}: GroupProps<T> & { /** Whether the work includes CDL driving. */ cdlDriver: boolean }) {
  return (
    <>
      {cdlDriver && (
        <>
          <Controller
            control={control}
            name={field<T>("drivingStyles")}
            render={({ field: input }) => (
              <ChoiceGroup
                multiple
                label="What kind of driving do you do?"
                description="Select all that apply."
                options={DRIVING_OPTIONS}
                value={input.value ?? []}
                onChange={input.onChange}
                error={errorOf("drivingStyles")}
                disabled={disabled}
                required
              />
            )}
          />

          <Controller
            control={control}
            name={field<T>("equipmentTypes")}
            render={({ field: input }) => (
              <ChoiceGroup
                multiple
                label="What equipment do you run?"
                description="Select all that apply."
                options={EQUIPMENT_OPTIONS}
                value={input.value ?? []}
                onChange={input.onChange}
                error={errorOf("equipmentTypes")}
                disabled={disabled}
                columns={2}
                required
              />
            )}
          />

          <Controller
            control={control}
            name={field<T>("transmission")}
            render={({ field: input }) => (
              <ChoiceGroup
                label={TRANSMISSION_QUESTION}
                options={TRANSMISSION_CHOICES}
                value={input.value ?? undefined}
                onChange={input.onChange}
                error={errorOf("transmission")}
                disabled={disabled}
                required
              />
            )}
          />
        </>
      )}

      <CheckChoice control={control} name="twicActive" errorOf={errorOf} disabled={disabled} />
      <CheckChoice
        control={control}
        name="medicalCardActive"
        errorOf={errorOf}
        disabled={disabled}
      />

      {cdlDriver && (
        <>
          <CheckChoice
            control={control}
            name="clearinghouseRegistered"
            errorOf={errorOf}
            disabled={disabled}
          />
          <CheckChoice
            control={control}
            name="mvrClean3Years"
            errorOf={errorOf}
            disabled={disabled}
          />
        </>
      )}
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
