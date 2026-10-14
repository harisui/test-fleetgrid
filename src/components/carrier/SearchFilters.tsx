"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { FormField } from "@/components/shared/FormField";
import { SelectInput } from "@/components/shared/SelectInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  CDL_CLASS_FILTER_OPTIONS,
  MIN_YEARS_OPTIONS,
  MVR_FILTER_OPTIONS,
  RADIUS_OPTIONS,
  YES_NO_FILTER_OPTIONS,
} from "@/lib/carrier/options";
import { ENDORSEMENT_OPTIONS, EQUIPMENT_CHIPS } from "@/lib/onboarding/options";
import type { DriverSearchInput } from "@/lib/validation/carrier.schema";

interface SearchFiltersProps {
  /** The filters as applied to the current results. */
  filters: DriverSearchInput;
}

/** A dropdown filter inside the GET form: the chosen value is a plain form field. */
function FilterSelect({
  name,
  label,
  options,
  initial,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <FormField label={label} errorIcon={false}>
      <SelectInput name={name} value={value} onValueChange={setValue} options={options} />
    </FormField>
  );
}

/** A list of boxes that submit as one repeated query field. */
function FilterChecklist<T extends string>({
  name,
  label,
  options,
  checked,
}: {
  name: string;
  label: string;
  options: readonly { value: T; label: string; description?: string }[];
  checked: readonly T[];
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-label leading-label font-semibold">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const boxId = `${id}-${option.value}`;
          return (
            <div key={option.value} className="flex min-h-target items-center gap-3">
              <Checkbox
                id={boxId}
                name={name}
                value={option.value}
                defaultChecked={checked.includes(option.value)}
              />
              <Label htmlFor={boxId} className="cursor-pointer font-normal">
                {option.label}
                {option.description && (
                  <span className="text-muted-foreground"> ({option.description})</span>
                )}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

const flagValue = (value: boolean | undefined) =>
  value === undefined ? "any" : value ? "true" : "false";

/**
 * The search form. It submits as a GET, so every search has a URL the carrier can bookmark
 * or share, and the page renders the results on the server.
 */
export function SearchFilters({ filters }: SearchFiltersProps) {
  const manualId = useId();
  const radiusOptions = RADIUS_OPTIONS.some((option) => option.value === String(filters.radiusMiles))
    ? RADIUS_OPTIONS
    : [...RADIUS_OPTIONS, { value: String(filters.radiusMiles), label: `${filters.radiusMiles} miles` }];

  return (
    <form
      method="get"
      action="/carrier/search"
      aria-label="Search filters"
      className="flex flex-col gap-5 rounded-card border border-border bg-card p-4"
      data-slot="search-filters"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <FilterSelect
          name="radiusMiles"
          label="Distance from your yard"
          options={radiusOptions}
          initial={String(filters.radiusMiles)}
        />
        <FilterSelect
          name="cdlClass"
          label="CDL class"
          options={CDL_CLASS_FILTER_OPTIONS}
          initial={filters.cdlClass ?? "any"}
        />
        <FilterSelect
          name="minYears"
          label="Experience"
          options={MIN_YEARS_OPTIONS}
          initial={filters.minYears === undefined ? "any" : String(filters.minYears)}
        />
        <FilterSelect
          name="mvrMax"
          label="Driving record"
          options={MVR_FILTER_OPTIONS}
          initial={filters.mvrMax ?? "any"}
        />
        <FilterSelect
          name="twicActive"
          label="Active TWIC card"
          options={YES_NO_FILTER_OPTIONS}
          initial={flagValue(filters.twicActive)}
        />
        <FilterSelect
          name="medicalCardActive"
          label="Current DOT medical card"
          options={YES_NO_FILTER_OPTIONS}
          initial={flagValue(filters.medicalCardActive)}
        />
      </div>

      <div className="flex min-h-target items-center gap-3">
        <Checkbox
          id={manualId}
          name="manualOnly"
          value="true"
          defaultChecked={filters.manualOnly === true}
        />
        <Label htmlFor={manualId} className="cursor-pointer font-normal">
          Must drive a manual
        </Label>
      </div>

      <FilterChecklist
        name="endorsements"
        label="Endorsements (every one you pick)"
        options={ENDORSEMENT_OPTIONS}
        checked={filters.endorsements}
      />
      <FilterChecklist
        name="equipmentTypes"
        label="Equipment (every one you pick)"
        options={EQUIPMENT_CHIPS}
        checked={filters.equipmentTypes}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit">
          <Search aria-hidden="true" />
          Search
        </Button>
        <Button asChild variant="secondary">
          <Link href="/carrier/search">Clear filters</Link>
        </Button>
      </div>
    </form>
  );
}
