"use client";

import { X } from "lucide-react";
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

      <div className="flex gap-2">
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
          className="h-11"
          enterKeyHint="done"
        />
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={addDraft}
          disabled={disabled || full || draft.trim() === ""}
        >
          Add
        </Button>
      </div>

      {description && (
        <p id={`${id}-description`} className="text-muted-foreground text-sm">
          {description}
        </p>
      )}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`${label} added`}>
          {value.map((tag) => (
            <li
              key={tag}
              className="bg-secondary text-secondary-foreground flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== tag))}
                disabled={disabled}
                aria-label={`Remove ${tag}`}
                className="hover:bg-foreground/10 focus-visible:ring-ring flex size-7 items-center justify-center rounded-full outline-none focus-visible:ring-2"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
