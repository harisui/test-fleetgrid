"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface BaseProps<T extends string> {
  /** Shown as the group legend. */
  label: string;
  options: readonly ChoiceOption<T>[];
  error?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  /** Grid columns on phones. Defaults to 1 for long labels. */
  columns?: 1 | 2 | 3;
}

interface MultipleProps<T extends string> extends BaseProps<T> {
  multiple: true;
  value: readonly T[];
  onChange: (value: T[]) => void;
}

interface SingleProps<T extends string> extends BaseProps<T> {
  multiple?: false;
  value: T | undefined;
  onChange: (value: T) => void;
}

type ChoiceGroupProps<T extends string> = MultipleProps<T> | SingleProps<T>;

const COLUMN_CLASS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" } as const;

/**
 * Large, tappable choice cards backed by real checkboxes or radios.
 * Use `multiple` for "select all that apply" and omit it for "pick one".
 */
export function ChoiceGroup<T extends string>(props: ChoiceGroupProps<T>) {
  const { label, options, error, description, required, disabled, columns = 1 } = props;
  const groupId = useId();
  const errorId = error ? `${groupId}-error` : undefined;
  const descriptionId = description ? `${groupId}-description` : undefined;

  const isSelected = (value: T) =>
    props.multiple ? props.value.includes(value) : props.value === value;

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

  return (
    <fieldset
      className="flex flex-col gap-2"
      disabled={disabled}
      aria-invalid={error ? true : undefined}
      aria-describedby={[descriptionId, errorId].filter(Boolean).join(" ") || undefined}
    >
      <legend className="mb-2 text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        )}
      </legend>
      {description && (
        <p id={descriptionId} className="text-muted-foreground -mt-1 text-sm">
          {description}
        </p>
      )}

      <div className={cn("grid gap-2", COLUMN_CLASS[columns])}>
        {options.map((option) => {
          const selected = isSelected(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "border-input bg-card flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                "has-focus-visible:border-ring has-focus-visible:ring-ring/50 has-focus-visible:ring-3",
                "has-disabled:cursor-not-allowed has-disabled:opacity-50",
                selected && "border-primary bg-secondary text-secondary-foreground",
                error && !selected && "border-destructive",
              )}
            >
              <input
                type={props.multiple ? "checkbox" : "radio"}
                name={groupId}
                value={option.value}
                checked={selected}
                onChange={() => toggle(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "border-input flex size-5 shrink-0 items-center justify-center border",
                  props.multiple ? "rounded-sm" : "rounded-full",
                  selected && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {selected && <Check className="size-3.5" />}
              </span>
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
    </fieldset>
  );
}
