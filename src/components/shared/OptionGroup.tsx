"use client";

import { CircleAlert } from "lucide-react";
import { useId, type KeyboardEvent } from "react";
import { OptionCard } from "@/components/shared/OptionCard";
import type { CardOption } from "@/lib/onboarding/options";
import { cn } from "@/lib/utils";

interface BaseProps<T extends string> {
  /** The question or group name. Hidden visually when the sign header already asks it. */
  label: string;
  labelHidden?: boolean;
  description?: string;
  options: readonly CardOption<T>[];
  error?: string;
  disabled?: boolean;
  /** Columns on phones. Desktop may add one more for short labels. */
  columns?: 1 | 2 | 3;
  layout?: "row" | "tile";
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

export type OptionGroupProps<T extends string> = MultipleProps<T> | SingleProps<T>;

const COLUMN_CLASS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
} as const;

/**
 * A set of option cards. Pick-one groups behave like radios (arrow keys move and select, one
 * tab stop). Pick-many groups behave like checkboxes (each card is a tab stop, Space toggles).
 * An error is one message under the group, never red borders on the cards.
 */
export function OptionGroup<T extends string>(props: OptionGroupProps<T>) {
  const {
    label,
    labelHidden,
    description,
    options,
    error,
    disabled,
    columns = 1,
    layout = "row",
  } = props;
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  const isSelected = (value: T) =>
    props.multiple ? props.value.includes(value) : props.value === value;

  function select(value: T) {
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

  // Radio groups: arrow keys move focus and select, like native radios.
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (props.multiple) return;
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: options.length - 1,
    };
    const target = keys[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = options[(target + options.length) % options.length];
    props.onChange(next.value);
    document.getElementById(`${id}-${next.value}`)?.focus();
  }

  const selectedIndex = props.multiple
    ? -1
    : options.findIndex((option) => option.value === props.value);

  return (
    <div
      role={props.multiple ? "group" : "radiogroup"}
      aria-labelledby={labelId}
      aria-describedby={[descriptionId, errorId].filter(Boolean).join(" ") || undefined}
      aria-invalid={error ? true : undefined}
      data-slot="option-group"
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

      <div className={cn("grid gap-3", COLUMN_CLASS[columns])}>
        {options.map((option, index) => (
          <OptionCard
            key={option.value}
            id={`${id}-${option.value}`}
            label={option.label}
            description={option.description}
            icon={option.icon}
            role={props.multiple ? "checkbox" : "radio"}
            selected={isSelected(option.value)}
            onSelect={() => select(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            tabIndex={
              props.multiple
                ? undefined
                : index === (selectedIndex === -1 ? 0 : selectedIndex)
                  ? 0
                  : -1
            }
            disabled={disabled}
            layout={layout}
          />
        ))}
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
    </div>
  );
}
