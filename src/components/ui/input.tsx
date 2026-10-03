import * as React from "react";
import { cn } from "@/lib/utils";

/** 56px tall, 2px border, 18px text. Error state is a 2px destructive border (set with aria-invalid). */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-target-lg w-full min-w-0 rounded-field border-2 border-input bg-card px-4 text-body text-foreground transition-colors duration-(--dur-state) ease-standard file:inline-flex file:h-target file:border-0 file:bg-transparent file:text-label file:font-semibold file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
