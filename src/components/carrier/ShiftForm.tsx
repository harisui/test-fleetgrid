"use client";

import { fromZonedTime } from "date-fns-tz";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Controller, useWatch } from "react-hook-form";
import { ZipField } from "@/components/driver/ZipField";
import { useStepForm } from "@/components/driver/useStepForm";
import { FormField } from "@/components/shared/FormField";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { SelectInput } from "@/components/shared/SelectInput";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useZipLookup } from "@/hooks/useZipLookup";
import { ENDORSEMENT_OPTIONS, EQUIPMENT_CHIPS } from "@/lib/onboarding/options";
import { POST_BUTTON, POST_BUTTON_QUIET, QUIET_HOURS_FORM_HELP } from "@/lib/shifts/copy";
import { sendAfterFor } from "@/lib/shifts/schedule";
import { SHIFT_TIME_ZONE } from "@/lib/shifts/texts";
import { SHIFT_OUTSIDE_AREA_MESSAGE, shiftPostSchema, type ShiftPostFormValues } from "@/lib/validation/shift.schema";
import { lookupYardZipAction } from "@/server/actions/carrier.actions";
import { countShiftMatchesAction, postShiftAction } from "@/server/actions/shift.actions";

const CLASS_OPTIONS = [
  { value: "A", label: "Class A" },
  { value: "B", label: "Class A or B" },
];

const YEARS_OPTIONS = [
  { value: "0", label: "Any" },
  { value: "1", label: "1 year or more" },
  { value: "3", label: "3 years or more" },
  { value: "5", label: "5 years or more" },
  { value: "10", label: "10 years or more" },
];

const CHECKS = [
  { name: "twicRequired", label: "TWIC card required" },
  { name: "medicalRequired", label: "DOT medical card required" },
  { name: "manualRequired", label: "Must drive a manual" },
] as const;

/** A list of boxes for one array field. */
function BoxList<T extends string>({
  legend,
  options,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-label leading-label font-semibold">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <div key={option.value} className="flex min-h-target items-center gap-3">
            <Checkbox
              id={`${id}-${option.value}`}
              checked={value.includes(option.value)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange(checked ? [...value, option.value] : value.filter((item) => item !== option.value))
              }
            />
            <Label htmlFor={`${id}-${option.value}`} className="cursor-pointer font-normal">
              {option.label}
            </Label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function tomorrow(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return date.toLocaleDateString("en-CA", { timeZone: SHIFT_TIME_ZONE });
}

/**
 * Post a shift (T3.3): where and when, what it asks of a driver, the work, the required
 * on-site contact and an optional pay line. A live count shows how many drivers it would
 * reach, and the button says when it will send (quiet hours, 2026-11-01).
 */
export function ShiftForm() {
  const router = useRouter();
  const { form, submit, pending, formError, errorOf } = useStepForm({
    schema: shiftPostSchema,
    defaultValues: {
      zip: "",
      date: tomorrow(),
      startTime: "06:00",
      endTime: "14:00",
      cdlClass: "A",
      endorsements: [],
      minYears: "0",
      equipmentTypes: [],
      twicRequired: false,
      medicalRequired: false,
      manualRequired: false,
      payText: "",
      workDescription: "",
      onsiteContactName: "",
      onsiteContactPhone: "",
    } satisfies ShiftPostFormValues,
    onSave: async (values) => {
      const result = await postShiftAction(values);
      if (result.ok) router.push(`/carrier/shifts/${result.data.shift.id}`);
      return result;
    },
  });

  const watched = useWatch({ control: form.control });
  const lookup = useZipLookup(watched.zip, null, lookupYardZipAction);

  // The live count, a moment after the carrier stops typing.
  const [count, setCount] = useState<number | null>(null);
  const requirements = JSON.stringify({
    zip: watched.zip,
    cdlClass: watched.cdlClass,
    endorsements: watched.endorsements,
    minYears: watched.minYears,
    equipmentTypes: watched.equipmentTypes,
    twicRequired: watched.twicRequired,
    medicalRequired: watched.medicalRequired,
    manualRequired: watched.manualRequired,
  });
  const zipReady = /^\d{5}$/.test(String(watched.zip ?? ""));
  useEffect(() => {
    const input = JSON.parse(requirements) as { zip?: string };
    if (!/^\d{5}$/.test(input.zip ?? "")) return;
    let live = true;
    const timer = setTimeout(async () => {
      const result = await countShiftMatchesAction(input);
      if (live) setCount(result.ok ? result.data : null);
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [requirements]);

  // Quiet hours: when the button would send, from the date and start typed now.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  let held = false;
  if (now && watched.date && watched.startTime && /^\d{2}:\d{2}$/.test(watched.startTime)) {
    const start = fromZonedTime(`${watched.date}T${watched.startTime}:00`, SHIFT_TIME_ZONE);
    held = !Number.isNaN(start.getTime()) && sendAfterFor(now, start) !== null;
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6" data-slot="shift-form">
      <section className="flex flex-col gap-5" aria-labelledby="shift-where">
        <h2 id="shift-where" className="font-heading text-h3 leading-h3 font-semibold">
          Where and when
        </h2>
        <ZipField input={form.register("zip")} lookup={lookup} error={errorOf("zip")} disabled={pending} required />
        {lookup.inServiceArea === false && (
          <InlineNote variant="info" data-slot="shift-area-note">
            {SHIFT_OUTSIDE_AREA_MESSAGE}
          </InlineNote>
        )}
        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label="Date" error={errorOf("date")} required>
            <Input {...form.register("date")} type="date" disabled={pending} />
          </FormField>
          <FormField label="Start time" description="Houston time." error={errorOf("startTime")} required>
            <Input {...form.register("startTime")} type="time" disabled={pending} />
          </FormField>
          <FormField label="End time" error={errorOf("endTime")} required>
            <Input {...form.register("endTime")} type="time" disabled={pending} />
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="shift-driver">
        <h2 id="shift-driver" className="font-heading text-h3 leading-h3 font-semibold">
          The driver
        </h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="cdlClass"
            render={({ field }) => (
              <FormField label="CDL class" error={errorOf("cdlClass")} errorIcon={false} required>
                <SelectInput value={String(field.value)} onValueChange={field.onChange} options={CLASS_OPTIONS} disabled={pending} />
              </FormField>
            )}
          />
          <Controller
            control={form.control}
            name="minYears"
            render={({ field }) => (
              <FormField label="Years with a CDL" error={errorOf("minYears")} errorIcon={false}>
                <SelectInput value={String(field.value)} onValueChange={field.onChange} options={YEARS_OPTIONS} disabled={pending} />
              </FormField>
            )}
          />
        </div>
        <Controller
          control={form.control}
          name="endorsements"
          render={({ field }) => (
            <BoxList
              legend="Endorsements needed"
              options={ENDORSEMENT_OPTIONS}
              value={(field.value ?? []) as string[]}
              onChange={field.onChange}
              disabled={pending}
            />
          )}
        />
        <Controller
          control={form.control}
          name="equipmentTypes"
          render={({ field }) => (
            <BoxList
              legend="Equipment"
              options={EQUIPMENT_CHIPS}
              value={(field.value ?? []) as string[]}
              onChange={field.onChange}
              disabled={pending}
            />
          )}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label leading-label font-semibold">Also required (optional)</legend>
          {CHECKS.map((check) => (
            <Controller
              key={check.name}
              control={form.control}
              name={check.name}
              render={({ field }) => (
                <div className="flex min-h-target items-center gap-3">
                  <Checkbox
                    id={`shift-${check.name}`}
                    checked={field.value === true}
                    disabled={pending}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                  <Label htmlFor={`shift-${check.name}`} className="cursor-pointer font-normal">
                    {check.label}
                  </Label>
                </div>
              )}
            />
          ))}
        </fieldset>
        <p className="flex items-center gap-2 text-body leading-body" role="status" data-slot="match-count">
          <Users aria-hidden="true" className="size-5 text-muted-foreground" />
          {!zipReady || count === null
            ? "Enter the ZIP to see how many drivers this reaches."
            : count === 1
              ? "1 driver matches right now."
              : `${count} drivers match right now.`}
        </p>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="shift-work">
        <h2 id="shift-work" className="font-heading text-h3 leading-h3 font-semibold">
          The work
        </h2>
        <FormField
          label="What the driver will do"
          description="Loads, routes, the yard. The driver sees this after booking."
          error={errorOf("workDescription")}
          errorIcon={false}
          required
        >
          <Textarea {...form.register("workDescription")} maxLength={500} disabled={pending} />
        </FormField>
        <FormField label="Pay" description="Optional. Shown to the booked driver, never in a text." error={errorOf("payText")}>
          <Input {...form.register("payText")} maxLength={80} placeholder="$32 an hour" disabled={pending} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="On-site contact" description="Who the driver asks for." error={errorOf("onsiteContactName")} required>
            <Input {...form.register("onsiteContactName")} autoComplete="off" maxLength={100} disabled={pending} />
          </FormField>
          <FormField label="On-site phone" error={errorOf("onsiteContactPhone")} required>
            <Input {...form.register("onsiteContactPhone")} type="tel" inputMode="tel" autoComplete="off" disabled={pending} />
          </FormField>
        </div>
      </section>

      <InlineNote variant="info" data-slot="quiet-hours-help">
        {QUIET_HOURS_FORM_HELP}
      </InlineNote>

      {formError && (
        <InlineNote variant="error" role="alert">
          {formError}
        </InlineNote>
      )}

      <LoadingButton type="submit" loading={pending} loadingText="Posting...">
        {held ? POST_BUTTON_QUIET : POST_BUTTON}
      </LoadingButton>
    </form>
  );
}
