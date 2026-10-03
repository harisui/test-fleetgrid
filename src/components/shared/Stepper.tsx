"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface StepperProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  /** Shown under the number, for example "years". */
  unit: string;
  disabled?: boolean;
  error?: string;
}

/**
 * Big minus and plus buttons (56px) around a number the driver can also type.
 * Limits are enforced and explained, never silently clamped mid-typing.
 */
export function Stepper({ label, value, onChange, min, max, unit, disabled, error }: StepperProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : String(value));
  const atMin = value !== null && value <= min;
  const atMax = value !== null && value >= max;
  const limitNote = atMin
    ? `${min} is the lowest you can pick`
    : atMax
      ? `${max} is the highest you can pick`
      : undefined;
  const noteId = `${id}-note`;
  const errorId = error ? `${id}-error` : undefined;

  function commit(text: string) {
    setDraft(null);
    const digits = text.replace(/\D/g, "");
    if (digits === "") return onChange(null);
    onChange(Math.min(max, Math.max(min, Number.parseInt(digits, 10))));
  }

  function nudge(delta: number) {
    const current = value ?? (delta > 0 ? min - 1 : min + 1);
    onChange(Math.min(max, Math.max(min, current + delta)));
  }

  return (
    <div className="flex flex-col gap-2" data-slot="stepper">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => nudge(-1)}
          disabled={disabled || atMin}
          aria-label={`One ${unit.replace(/s$/, "")} less`}
          className="flex size-target-lg shrink-0 items-center justify-center rounded-button border-2 border-border-strong bg-card text-foreground transition-colors duration-(--dur-press) ease-standard hover:bg-muted active:bg-muted disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground"
        >
          <Minus aria-hidden="true" className="size-6" />
        </button>
        <div className="flex flex-1 flex-col items-center">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            pattern="\d*"
            value={shown}
            onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
            onBlur={(event) => commit(event.target.value)}
            disabled={disabled}
            aria-describedby={[noteId, errorId].filter(Boolean).join(" ") || undefined}
            aria-invalid={error ? true : undefined}
            placeholder="0"
            className={cn(
              "w-full bg-transparent text-center font-heading text-number leading-number font-semibold tabular-nums text-foreground placeholder:text-muted-foreground",
            )}
          />
          <span className="text-helper leading-helper text-muted-foreground">{unit}</span>
        </div>
        <button
          type="button"
          onClick={() => nudge(1)}
          disabled={disabled || atMax}
          aria-label={`One ${unit.replace(/s$/, "")} more`}
          className="flex size-target-lg shrink-0 items-center justify-center rounded-button border-2 border-border-strong bg-card text-foreground transition-colors duration-(--dur-press) ease-standard hover:bg-muted active:bg-muted disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground"
        >
          <Plus aria-hidden="true" className="size-6" />
        </button>
      </div>
      <p
        id={noteId}
        aria-live="polite"
        className="min-h-6 text-helper leading-helper text-muted-foreground"
      >
        {limitNote}
      </p>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-helper leading-helper font-semibold text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
