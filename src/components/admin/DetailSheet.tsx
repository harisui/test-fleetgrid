"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Actions, pinned to the bottom. */
  footer?: ReactNode;
  /** Less common actions, beside the close button. */
  menu?: ReactNode;
}

/**
 * Record details beside the list, so the admin never loses their place: a sheet from the
 * right edge, 560px on a tablet, 640px on a desktop and the whole screen on a phone, with the actions in a
 * sticky footer.
 */
export function DetailSheet({ open, onOpenChange, title, description, children, footer, menu }: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0 overflow-hidden">
        {menu && <div className="absolute top-3 right-14">{menu}</div>}
        <div className={cn("flex flex-col gap-1 border-b border-border p-4", menu ? "pr-28" : "pr-14")}>
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">Details</SheetDescription>
          )}
        </div>
        {/* Relative, so hidden text for screen readers stays inside this one scroll area. */}
        <div className="relative flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-border bg-popover p-4 sm:flex-row sm:justify-end" data-slot="detail-footer">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
