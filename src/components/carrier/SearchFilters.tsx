"use client";

import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { type ReactNode, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { FormField } from "@/components/shared/FormField";
import { LoadingButton } from "@/components/shared/LoadingButton";
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
import { SEARCH_RADIUS_DEFAULT_MILES } from "@/lib/constants";
import { ENDORSEMENT_OPTIONS, EQUIPMENT_CHIPS } from "@/lib/onboarding/options";
import { cn } from "@/lib/utils";
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

/** How many of the box filters (manual, endorsements, equipment) are on. */
export function countMoreFilters(filters: DriverSearchInput): number {
  return (filters.manualOnly ? 1 : 0) + filters.endorsements.length + filters.equipmentTypes.length;
}

/** How many filters differ from the plain search, for the phone's Filters button. */
export function countActiveFilters(filters: DriverSearchInput): number {
  return (
    (filters.radiusMiles !== SEARCH_RADIUS_DEFAULT_MILES ? 1 : 0) +
    [filters.cdlClass, filters.minYears, filters.mvrMax, filters.twicActive, filters.medicalCardActive].filter(
      (value) => value !== undefined,
    ).length +
    countMoreFilters(filters)
  );
}

/** A button that shows or hides a panel of the form. Hidden fields still submit with the form. */
function PanelToggle({
  open,
  onToggle,
  controls,
  children,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={className}
    >
      {children}
      <ChevronDown aria-hidden="true" className={cn("transition-transform", open && "rotate-180")} />
    </Button>
  );
}

/** Submit, with a spinner while the navigation to the new results is under way. */
function SearchButton() {
  const { pending } = useFormStatus();
  return (
    <LoadingButton type="submit" size="md" loading={pending} loadingText="Searching...">
      <Search aria-hidden="true" />
      Search
    </LoadingButton>
  );
}

/**
 * The search form, a bar above the results so the table keeps the page's width. The six
 * dropdowns sit in one row on a desktop; the box filters fold under "More filters" (open
 * when one is on). On a phone the whole form folds behind "Filters". It is a next/form GET:
 * the filters become the URL's query (a reload or a shared link shows the same search) and
 * submitting is a client-side navigation, not a page reload. Without JavaScript it still
 * works as a plain form.
 */
export function SearchFilters({ filters }: SearchFiltersProps) {
  const manualId = useId();
  const panelId = useId();
  const moreId = useId();
  const active = countActiveFilters(filters);
  const moreActive = countMoreFilters(filters);
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(moreActive > 0);
  const radiusOptions = RADIUS_OPTIONS.some((option) => option.value === String(filters.radiusMiles))
    ? RADIUS_OPTIONS
    : [...RADIUS_OPTIONS, { value: String(filters.radiusMiles), label: `${filters.radiusMiles} miles` }];

  return (
    <Form
      action="/carrier/search"
      scroll={false}
      aria-label="Search filters"
      className="flex flex-col gap-4 rounded-card border border-border bg-card p-4"
      data-slot="search-filters"
    >
      <PanelToggle
        open={open}
        onToggle={() => setOpen(!open)}
        controls={panelId}
        className="justify-between md:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal aria-hidden="true" />
          Filters{active > 0 && " "}
          {active > 0 && (
            <span className="text-muted-foreground" data-slot="active-filters">
              ({active} on)
            </span>
          )}
        </span>
      </PanelToggle>

      <div id={panelId} className={cn("flex flex-col gap-4", !open && "max-md:hidden")}>
        <div className="grid items-end gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <FilterSelect
            name="radiusMiles"
            label="Distance from yard"
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
            label="DOT medical card"
            options={YES_NO_FILTER_OPTIONS}
            initial={flagValue(filters.medicalCardActive)}
          />
        </div>

        <div
          id={moreId}
          className={cn(
            "grid gap-4 border-t border-border pt-4 md:grid-cols-2",
            !moreOpen && "hidden",
          )}
          data-slot="more-filters"
        >
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
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <PanelToggle open={moreOpen} onToggle={() => setMoreOpen(!moreOpen)} controls={moreId}>
            More filters{moreActive > 0 && " "}
            {moreActive > 0 && <span className="text-muted-foreground">({moreActive} on)</span>}
          </PanelToggle>
          <div className="flex flex-col gap-3 sm:ml-auto sm:flex-row">
            <Button asChild variant="secondary" size="md">
              <Link href="/carrier/search">Clear filters</Link>
            </Button>
            <SearchButton />
          </div>
        </div>
      </div>
    </Form>
  );
}
