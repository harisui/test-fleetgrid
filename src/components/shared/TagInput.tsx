"use client";

import { CircleAlert, X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TagInputProps {
  label: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  description?: string;
  error?: string;
  maxTags?: number;
  maxLength?: number;
  disabled?: boolean;
}

/** Free-text tags. Add with Enter, a comma or the Add button. Duplicates are ignored. */
export function TagInput({
  label,
  value,
  onChange,
  placeholder,
  description,
  error,
  maxTags = 20,
  maxLength = 60,
  disabled,
}: TagInputProps) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const full = value.length >= maxTags;

  function addDraft() {
    const tag = draft.trim().replace(/,+$/, "").trim();
    setDraft("");
    if (!tag || full) return;
    if (value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter must not submit the surrounding form while a tag is being typed.
      event.preventDefault();
      addDraft();
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  const describedBy =
    [description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>

      <div className="flex gap-3">
        <Input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addDraft}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled || full}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          enterKeyHint="done"
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

      {description && (
        <p id={`${id}-description`} className="text-helper leading-helper text-muted-foreground">
          {description}
        </p>
      )}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`${label} added`}>
          {value.map((tag) => (
            <li
              key={tag}
              className="flex h-target items-center gap-1 rounded-chip border border-border-strong bg-card pr-1 pl-4 text-label font-semibold"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== tag))}
                disabled={disabled}
                aria-label={`Remove ${tag}`}
                className="flex size-10 items-center justify-center rounded-badge hover:bg-muted"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p
          id={`${id}-error`}
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
