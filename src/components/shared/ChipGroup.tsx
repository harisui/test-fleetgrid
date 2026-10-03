"use client";

import { CircleAlert, Plus } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { Chip } from "@/components/shared/Chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ChipOption } from "@/lib/onboarding/options";
import { cn } from "@/lib/utils";

interface CustomEntry {
  /** Chip label, for example "Add another". */
  label: string;
  fieldLabel: string;
  placeholder?: string;
  helper?: string;
  maxLength?: number;
  /** Most entries allowed, including the preset ones. */
  max?: number;
}

interface BaseProps<T extends string | number> {
  label: string;
  labelHidden?: boolean;
  description?: string;
  options: readonly ChipOption<T>[];
  error?: string;
  disabled?: boolean;
}

interface MultipleProps<T extends string | number> extends BaseProps<T> {
  multiple: true;
  value: readonly T[];
  onChange: (value: T[]) => void;
  /** Lets the driver type a value that is not in the list. Multi-select, string values only. */
  custom?: T extends string ? CustomEntry : never;
}

interface SingleProps<T extends string | number> extends BaseProps<T> {
  multiple?: false;
  value: T | undefined;
  onChange: (value: T) => void;
  custom?: never;
}

export type ChipGroupProps<T extends string | number> = MultipleProps<T> | SingleProps<T>;

/**
 * Quick picks. Pick-one groups keep one chip pressed; pick-many groups toggle each chip.
 * With `custom`, an "Add another" chip opens a field and typed values become chips too.
 */
export function ChipGroup<T extends string | number>(props: ChipGroupProps<T>) {
  const { label, labelHidden, description, options, error, disabled } = props;
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const selectedValues: readonly T[] = props.multiple
    ? props.value
    : props.value === undefined
      ? []
      : [props.value];
  const customValues = selectedValues.filter(
    (value) => !options.some((option) => option.value === value),
  );
  const custom = props.multiple ? props.custom : undefined;
  const full = custom?.max !== undefined && selectedValues.length >= custom.max;

  function toggle(value: T) {
    if (props.multiple) {
      props.onChange(
        props.value.includes(value)
          ? props.value.filter((item) => item !== value)
          : [...props.value, value],
      );
    } else {
      props.onChange(value);
    }
  }

  function addDraft() {
    if (!props.multiple) return;
    const text = draft.trim();
    setDraft("");
    if (!text || full) return;
    const exists = selectedValues.some(
      (value) => String(value).toLowerCase() === text.toLowerCase(),
    );
    const preset = options.find((option) => option.label.toLowerCase() === text.toLowerCase());
    if (preset) {
      if (!exists) props.onChange([...props.value, preset.value]);
      return;
    }
    if (!exists) props.onChange([...props.value, text as T]);
  }

  function handleDraftKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      // Enter must not submit the surrounding form while a value is being typed.
      event.preventDefault();
      addDraft();
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={[descriptionId, errorId].filter(Boolean).join(" ") || undefined}
      data-slot="chip-group"
      className="flex flex-col gap-3"
    >
      <p
        id={labelId}
        className={cn("text-label leading-label font-semibold", labelHidden && "sr-only")}
      >
        {label}
      </p>
      {description && (
        <p id={descriptionId} className="-mt-1 text-helper leading-helper text-muted-foreground">
          {description}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <Chip
            key={String(option.value)}
            selected={selectedValues.includes(option.value)}
            onClick={() => toggle(option.value)}
            disabled={disabled}
          >
            {option.label}
          </Chip>
        ))}
        {customValues.map((value) => (
          <Chip
            key={String(value)}
            selected
            onClick={() => toggle(value)}
            disabled={disabled}
            aria-label={`${String(value)}, remove`}
          >
            {String(value)}
          </Chip>
        ))}
        {custom && (
          <Chip
            selected={adding}
            icon={Plus}
            onClick={() => setAdding((open) => !open)}
            disabled={disabled || full}
            aria-expanded={adding}
          >
            {custom.label}
          </Chip>
        )}
      </div>

      {custom && adding && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-custom`}>{custom.fieldLabel}</Label>
          <div className="flex gap-3">
            <Input
              id={`${id}-custom`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleDraftKey}
              placeholder={custom.placeholder}
              maxLength={custom.maxLength}
              disabled={disabled || full}
              enterKeyHint="done"
              aria-describedby={custom.helper ? `${id}-custom-helper` : undefined}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={addDraft}
              disabled={disabled || full || draft.trim() === ""}
            >
              Add
            </Button>
          </div>
          {custom.helper && (
            <p
              id={`${id}-custom-helper`}
              className="text-helper leading-helper text-muted-foreground"
            >
              {custom.helper}
            </p>
          )}
        </div>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2 text-helper leading-helper font-semibold text-destructive"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
