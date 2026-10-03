"use client";

import type { ComponentProps } from "react";
import { OTP_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * One real input, drawn as six large boxes. The input stays in the accessibility tree and
 * keeps SMS autofill and paste working; the boxes only show what was typed.
 */
export function CodeInput({
  digits,
  focused,
  className,
  ...props
}: ComponentProps<"input"> & { digits: string; focused: boolean }) {
  return (
    <div className="relative">
      <div aria-hidden="true" className="grid grid-cols-6 gap-2" data-slot="code-boxes">
        {Array.from({ length: OTP_LENGTH }, (_, index) => (
          <div
            key={index}
            className={cn(
              "flex h-target-lg items-center justify-center rounded-field border-2 bg-card font-mono text-code leading-code font-medium tabular-nums",
              focused && index === Math.min(digits.length, OTP_LENGTH - 1)
                ? "border-ring"
                : "border-input",
              props["aria-invalid"] && "border-destructive",
            )}
          >
            {digits[index] ?? ""}
          </div>
        ))}
      </div>
      <input {...props} className={cn("absolute inset-0 h-full w-full opacity-0", className)} />
    </div>
  );
}
