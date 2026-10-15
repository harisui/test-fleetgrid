import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DeviceFrameProps {
  children: ReactNode;
  /** The caption under the frame, factual. */
  caption?: string;
  className?: string;
}

/** A plain phone frame: card surface, 1px border, 6px corners, a graphite top bar. No gloss. */
export function DeviceFrame({ children, caption, className }: DeviceFrameProps) {
  return (
    <figure className={cn("flex w-full max-w-sm flex-col gap-3", className)} data-slot="device-frame">
      <div className="overflow-hidden rounded-card border border-border-strong bg-card">
        <div aria-hidden="true" className="flex h-6 items-center justify-center bg-sign-panel">
          <span className="h-1 w-10 rounded-badge bg-sign-panel-muted" />
        </div>
        <div className="flex flex-col gap-4 p-4">{children}</div>
      </div>
      {caption && (
        <figcaption className="text-helper leading-helper text-muted-foreground">{caption}</figcaption>
      )}
    </figure>
  );
}
