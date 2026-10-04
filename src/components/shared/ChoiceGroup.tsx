"use client";

import { Check, CircleAlert } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** One plain line under the label. Read by screen readers as the description, not the name. */
  description?: string;
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
 * Compact choice cards backed by real checkboxes or radios, for the profile editor.
 * Onboarding uses OptionGroup (icon cards). Selected state is graphite, never orange.
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
      <legend className="mb-2 text-label leading-label font-semibold">
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        )}
      </legend>
      {description && (
        <p id={descriptionId} className="-mt-1 text-helper leading-helper text-muted-foreground">
          {description}
        </p>
      )}

      <div className={cn("grid gap-3", COLUMN_CLASS[columns])}>
        {options.map((option) => {
          const selected = isSelected(option.value);
          const labelId = `${groupId}-${option.value}-label`;
          const optionDescriptionId = option.description
            ? `${groupId}-${option.value}-description`
            : undefined;
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-card-min cursor-pointer items-center gap-3 rounded-card border bg-card px-3 py-2 text-label font-semibold transition-colors duration-(--dur-state) ease-standard",
                "has-disabled:cursor-not-allowed has-disabled:text-muted-foreground",
                selected
                  ? "border-selection bg-selection-tint ring-1 ring-selection ring-inset"
                  : "border-border-strong",
              )}
            >
              <input
                type={props.multiple ? "checkbox" : "radio"}
                name={groupId}
                value={option.value}
                checked={selected}
                onChange={() => toggle(option.value)}
                aria-labelledby={labelId}
                aria-describedby={optionDescriptionId}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-badge border-2 border-border-strong bg-card",
                  selected && "border-selection bg-selection text-selection-foreground",
                )}
              >
                {selected && <Check className="size-4" strokeWidth={3} />}
              </span>
              <span className="flex flex-col">
                <span id={labelId}>{option.label}</span>
                {option.description && (
                  <span
                    id={optionDescriptionId}
                    className="text-helper leading-helper font-normal text-muted-foreground"
                  >
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

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
    </fieldset>
  );
}
