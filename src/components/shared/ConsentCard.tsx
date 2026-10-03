"use client";

import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface ConsentCardProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The full consent text, shown in full. Never truncated or hidden behind a link. */
  text: string;
  /** Links to the terms, shown under the text inside the card. */
  children?: ReactNode;
  error?: string;
  disabled?: boolean;
}

/**
 * The SMS consent. The whole card is the tap target, the box is 24px inside a 48px hit area,
 * and checking it turns the border and tint graphite.
 */
export function ConsentCard({
  id,
  checked,
  onCheckedChange,
  text,
  children,
  error,
  disabled,
}: ConsentCardProps) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-3" data-slot="consent-card">
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer gap-4 rounded-card border bg-card p-4 transition-colors duration-(--dur-state) ease-standard",
          checked
            ? "border-selection bg-selection-tint ring-1 ring-selection ring-inset"
            : "border-border-strong",
          disabled && "cursor-not-allowed",
        )}
      >
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(next) => onCheckedChange(next === true)}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-0.5"
        />
        <span className="flex min-w-0 flex-col gap-2 text-helper leading-helper">
          <span>{text}</span>
          {children && <span className="text-muted-foreground">{children}</span>}
        </span>
      </label>
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
