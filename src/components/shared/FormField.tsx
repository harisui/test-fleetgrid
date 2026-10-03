"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ControlProps {
  id?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}

interface FormFieldProps {
  label: string;
  /** A single form control (input, select trigger, textarea). It receives id and aria props. */
  children: ReactElement<ControlProps>;
  error?: string;
  description?: ReactNode;
  required?: boolean;
  /** Shows a check inside the field once the value is known to be good. */
  success?: boolean;
  className?: string;
}

/**
 * Label above, control, helper text below, error with an icon. Wired together for
 * accessibility and usable with react-hook-form's `register`.
 */
export function FormField({
  label,
  children,
  error,
  description,
  required = false,
  success = false,
  className,
}: FormFieldProps) {
  const generatedId = useId();
  const id = (isValidElement(children) && children.props.id) || generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const showCheck = success && !error;

  const control = cloneElement(children, {
    id,
    className: cn(children.props.className, showCheck && "pr-12"),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": required || undefined,
  });

  return (
    <div className={cn("flex flex-col gap-2", className)} data-slot="form-field">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
      </Label>
      {showCheck ? (
        <div className="relative">
          {control}
          <CircleCheck
            aria-hidden="true"
            data-slot="field-success"
            className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-success"
          />
        </div>
      ) : (
        control
      )}
      {description && (
        <p id={descriptionId} className="text-helper leading-helper text-muted-foreground">
          {description}
        </p>
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
