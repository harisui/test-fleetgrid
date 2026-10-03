"use client";

import type { LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { CheckBadge } from "@/components/shared/CheckBadge";
import { cn } from "@/lib/utils";

export interface OptionCardProps {
  id?: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  selected: boolean;
  /** radio for pick-one groups, checkbox for pick-many groups. */
  role: "radio" | "checkbox";
  onSelect: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  tabIndex?: number;
  disabled?: boolean;
  /** `row` puts the icon beside the text. `tile` stacks them for short labels in a grid. */
  layout?: "row" | "tile";
}

/**
 * A large tappable choice. Unselected: 1px border. Selected: 2px graphite border, graphite
 * tint, graphite icon tile and the orange check badge. State is never color alone: the badge,
 * the border width and aria-checked all change together.
 */
export function OptionCard({
  id,
  label,
  description,
  icon: Icon,
  selected,
  role,
  onSelect,
  onKeyDown,
  tabIndex,
  disabled,
  layout = "row",
}: OptionCardProps) {
  return (
    <button
      type="button"
      id={id}
      role={role}
      aria-checked={selected}
      data-slot="option-card"
      data-selected={selected ? "true" : "false"}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      disabled={disabled}
      className={cn(
        "relative flex min-h-card-min w-full items-center gap-3 rounded-card border bg-card p-3 text-left transition-colors duration-(--dur-state) ease-standard disabled:cursor-not-allowed disabled:text-muted-foreground",
        selected
          ? "border-selection bg-selection-tint ring-1 ring-selection ring-inset"
          : "border-border-strong hover:bg-muted",
        layout === "tile" && "flex-col items-start gap-2",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-field",
          selected ? "bg-selection text-selection-foreground" : "bg-muted text-foreground",
        )}
      >
        <Icon className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body leading-body font-semibold">{label}</span>
        {description && (
          <span className="block text-helper leading-helper text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      {selected && <CheckBadge />}
    </button>
  );
}
