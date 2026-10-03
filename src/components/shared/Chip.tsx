"use client";

import { Check, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface ChipProps extends Omit<ComponentProps<"button">, "type"> {
  selected: boolean;
  /** Replaces the leading check. Used by the "Add another" chip. */
  icon?: LucideIcon;
}

/**
 * A quick pick. 48px tall, 4px corners, 1px border. Selected: 2px graphite border, graphite
 * tint and a leading check, so the state never relies on color alone.
 */
export function Chip({ selected, icon: Icon, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-slot="chip"
      className={cn(
        "inline-flex h-target items-center gap-2 rounded-chip border bg-card px-4 text-label font-semibold text-foreground transition-colors duration-(--dur-state) ease-standard disabled:cursor-not-allowed disabled:text-muted-foreground",
        selected
          ? "border-selection bg-selection-tint ring-1 ring-selection ring-inset"
          : "border-border-strong hover:bg-muted",
        className,
      )}
      {...props}
    >
      {Icon ? (
        <Icon aria-hidden="true" className="size-5" />
      ) : (
        selected && <Check aria-hidden="true" className="size-5 text-selection" />
      )}
      {children}
    </button>
  );
}
