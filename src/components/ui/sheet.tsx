"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog as DialogPrimitive } from "radix-ui";

/** A bottom sheet for phones: a dialog that rises from the bottom edge. */
function Sheet({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

export type SheetSide = "bottom" | "left" | "right";

const SIDE_CLASSES: Record<SheetSide, string> = {
  /** Full width, pinned to the bottom, 8px top corners, a graphite handle, padded for the home bar. */
  bottom:
    "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-sheet border-t-2 border-border-strong px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
  /** A side panel from the left edge (the admin menu on a phone). */
  left: "inset-y-0 left-0 h-dvh w-80 max-w-[85vw] border-r border-border p-4",
  /** A side panel from the right edge (record details): 480px on a desktop, the whole screen on a phone. */
  right: "inset-y-0 right-0 h-dvh w-full border-l border-border p-0 sm:w-[30rem]",
};

/** Fades in like every other surface; it never springs. */
function SheetContent({
  className,
  children,
  side = "bottom",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: SheetSide }) {
  return (
    <DialogPrimitive.Portal data-slot="sheet-portal">
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 isolate z-50 bg-sign-panel/70 duration-(--dur-state) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 overflow-y-auto bg-popover text-popover-foreground shadow-2 duration-(--dur-state) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          SIDE_CLASSES[side],
          className,
        )}
        {...props}
      >
        {side === "bottom" && (
          <span
            aria-hidden="true"
            className="mx-auto h-1 w-10 shrink-0 rounded-badge bg-border-strong"
          />
        )}
        {children}
        <DialogPrimitive.Close data-slot="sheet-close" asChild>
          <Button variant="ghost" size="icon" className="absolute top-3 right-2">
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("pr-12 font-heading text-h2 leading-h2 font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-helper leading-helper text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger };
