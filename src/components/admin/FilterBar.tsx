"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useId, useState } from "react";
import { FormField } from "@/components/shared/FormField";
import { SelectInput } from "@/components/shared/SelectInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  name: string;
  label: string;
  /** "" means no filter; the first option should say so ("Any"). */
  value: string;
  options: readonly FilterOption[];
  /**
   * A filter that only a link sets (one QR code's sign-ups, say): no select, but its chip
   * shows and both forms carry it along.
   */
  hidden?: boolean;
}

interface FilterBarProps {
  /** The page the filters belong to; every filter becomes a query parameter of it. */
  action: string;
  search?: { name: string; label: string; placeholder?: string; value: string };
  filters: FilterDefinition[];
  /** Query parameters to carry along unchanged (sorting, for example). */
  keep?: Record<string, string>;
}

/** The chips for the filters that are on, each with a link that drops just that one. */
export function activeFilterChips({ action, search, filters, keep = {} }: FilterBarProps) {
  const current = new URLSearchParams(keep);
  if (search?.value) current.set(search.name, search.value);
  for (const filter of filters) if (filter.value) current.set(filter.name, filter.value);

  const without = (name: string) => {
    const next = new URLSearchParams(current);
    next.delete(name);
    const query = next.toString();
    return query ? `${action}?${query}` : action;
  };

  const chips: { name: string; text: string; href: string }[] = [];
  if (search?.value) chips.push({ name: search.name, text: `${search.label}: ${search.value}`, href: without(search.name) });
  for (const filter of filters) {
    if (!filter.value) continue;
    const label = filter.options.find((option) => option.value === filter.value)?.label ?? filter.value;
    chips.push({ name: filter.name, text: `${filter.label}: ${label}`, href: without(filter.name) });
  }
  return chips;
}

function SelectFilter({ filter }: { filter: FilterDefinition }) {
  const [value, setValue] = useState(filter.value);
  return (
    <FormField label={filter.label} errorIcon={false}>
      <SelectInput
        name={filter.name}
        value={value}
        onValueChange={setValue}
        options={filter.options}
        className="h-target"
      />
    </FormField>
  );
}

function KeepFields({ keep, filters }: { keep: Record<string, string>; filters: FilterDefinition[] }) {
  const hidden = filters.filter((filter) => filter.hidden && filter.value).map((filter) => [filter.name, filter.value] as const);
  return (
    <>
      {[...Object.entries(keep), ...hidden].map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

/**
 * Search plus select filters, as a GET form so every view is a URL: a refresh keeps it and
 * a link shares it. Active filters show as chips with a remove link; "Clear filters" goes
 * back to the plain page. On a phone the selects fold into a "Filters" sheet.
 */
export function FilterBar(props: FilterBarProps) {
  const { action, search, filters, keep = {} } = props;
  const searchId = useId();
  const chips = activeFilterChips(props);
  const selects = filters.filter((filter) => !filter.hidden);
  const activeCount = selects.filter((filter) => filter.value).length;
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3" data-slot="filter-bar">
      <Form action={action} scroll={false} className="flex flex-col gap-3 lg:flex-row lg:items-end" aria-label="Filters">
        <KeepFields keep={keep} filters={filters} />
        {search && (
          <div className="relative flex-1">
            <label htmlFor={searchId} className="sr-only">
              {search.label}
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              name={search.name}
              type="search"
              defaultValue={search.value}
              placeholder={search.placeholder ?? search.label}
              className="h-target pl-12"
              enterKeyHint="search"
            />
          </div>
        )}
        {/* Desktop: the selects inline. */}
        <div className="hidden gap-3 lg:flex">
          {selects.map((filter) => (
            <SelectFilter key={filter.name} filter={filter} />
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" size="md" className="flex-1 lg:flex-none">
            <Search aria-hidden="true" />
            Apply
          </Button>
          {/* Phones: the selects in a sheet, with their own form. */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="secondary" size="md" className="lg:hidden" aria-label={activeCount > 0 ? `Filters, ${activeCount} on` : "Filters"}>
                <SlidersHorizontal aria-hidden="true" />
                Filters
                {activeCount > 0 && <span className="text-muted-foreground">({activeCount})</span>}
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Narrow the list. The view keeps its filters in the address.</SheetDescription>
              <Form action={action} scroll={false} className="flex flex-col gap-4" onSubmit={() => setOpen(false)}>
                <KeepFields keep={keep} filters={filters} />
                {search && <input type="hidden" name={search.name} value={search.value} />}
                {selects.map((filter) => (
                  <SelectFilter key={filter.name} filter={filter} />
                ))}
                <Button type="submit" size="md">
                  Apply filters
                </Button>
              </Form>
            </SheetContent>
          </Sheet>
        </div>
      </Form>

      {chips.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.name}>
              <Link
                href={chip.href}
                className="inline-flex h-9 items-center gap-1.5 rounded-badge border border-border bg-muted px-3 text-small leading-small font-semibold hover:bg-accent"
                data-slot="filter-chip"
              >
                {chip.text}
                <X aria-hidden="true" className="size-4" />
                <span className="sr-only">(remove)</span>
              </Link>
            </li>
          ))}
          <li>
            <Link href={action} className="text-small leading-small font-semibold underline underline-offset-4" data-slot="clear-filters">
              Clear filters
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
