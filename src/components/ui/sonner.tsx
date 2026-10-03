"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

/**
 * Toasts sit at the bottom on phones, above the sticky action bar, so the thumb stays near the
 * actions. Each one is a raised surface with a 4px rule on the left in its status color, an icon
 * and plain text. They stay for 6 seconds and pause while hovered or focused. No slide-bounce.
 */
const TOAST_DURATION_MS = 6000;
/** Height of the sticky action bar plus a gutter. */
const ACTION_BAR_CLEARANCE_PX = 104;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      position="bottom-center"
      duration={TOAST_DURATION_MS}
      mobileOffset={{ bottom: ACTION_BAR_CLEARANCE_PX }}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface-raised)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-card)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast border-l-4 border-l-border-strong text-body shadow-2 [&_[data-icon]]:text-foreground",
          success: "border-l-success [&_[data-icon]]:text-success",
          info: "border-l-info [&_[data-icon]]:text-info",
          warning: "border-l-warning [&_[data-icon]]:text-warning",
          error: "border-l-destructive [&_[data-icon]]:text-destructive",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
