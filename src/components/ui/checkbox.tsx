"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { CheckIcon } from "lucide-react";

/**
 * 24px box with 2px corners inside a 48px hit area. Checked is graphite (the selection
 * color), never orange.
 */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-6 shrink-0 items-center justify-center rounded-badge border-2 border-border-strong bg-card text-selection-foreground transition-colors duration-(--dur-state) ease-standard after:absolute after:-inset-3 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted aria-invalid:border-destructive data-checked:border-selection data-checked:bg-selection",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-4"
      >
        <CheckIcon strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
