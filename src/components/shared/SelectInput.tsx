"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectInputProps {
  id?: string;
  name?: string;
  /** The chosen value, or "" for none (the placeholder shows). */
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}

/**
 * The dropdown used everywhere a person picks one value from a list: the Workshop trigger
 * (56px, 2px border) and a graphite list instead of the browser's own menu, so it looks the
 * same on every phone and in both themes. Works with FormField and react-hook-form's Controller.
 */
export function SelectInput({
  id,
  name,
  value,
  onValueChange,
  onBlur,
  options,
  placeholder = "Select",
  disabled,
  required,
  autoComplete,
  className,
  ...aria
}: SelectInputProps) {
  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      name={name}
      disabled={disabled}
      required={required}
      autoComplete={autoComplete}
    >
      <SelectTrigger
        id={id}
        className={className}
        onBlur={onBlur}
        aria-invalid={aria["aria-invalid"]}
        aria-describedby={aria["aria-describedby"]}
        aria-required={aria["aria-required"]}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
