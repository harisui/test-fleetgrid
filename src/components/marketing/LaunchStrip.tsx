"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LAUNCH_STRIP } from "@/content/marketing";
import {
  LAUNCH_STRIP_DISMISSED,
  LAUNCH_STRIP_DISMISSED_CLASS,
  LAUNCH_STRIP_STORAGE_KEY,
} from "@/lib/motion";

/**
 * The thin graphite strip above the site header. One tap dismisses it for good on this
 * browser: the choice is written to localStorage and the inline script in the root layout
 * hides the strip before paint on every later visit (globals.css).
 */
export function LaunchStrip() {
  function dismiss() {
    document.documentElement.classList.add(LAUNCH_STRIP_DISMISSED_CLASS);
    try {
      localStorage.setItem(LAUNCH_STRIP_STORAGE_KEY, LAUNCH_STRIP_DISMISSED);
    } catch {
      // Private mode or storage off: the strip returns next visit, which is fine.
    }
  }

  return (
    <div
      data-slot="launch-strip"
      className="bg-sign-panel text-sign-panel-foreground"
      role="region"
      aria-label="Launch area"
    >
      <div className="mx-auto flex min-h-target w-full max-w-5xl items-center gap-2 pl-4 pr-1">
        <p className="flex-1 py-2 font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow uppercase">
          {LAUNCH_STRIP.text}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={LAUNCH_STRIP.dismissLabel}
          onClick={dismiss}
          className="text-current hover:bg-sign-panel-foreground/10"
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </div>
    </div>
  );
}
