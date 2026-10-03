import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The 20px square check in the top-right corner of a selected card.
 * One of the four places the orange fill is allowed (with the primary button, the progress
 * fill and the sign-panel stripe).
 */
export function CheckBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="check-badge"
      className={cn(
        "pointer-events-none absolute top-0 right-0 flex size-5 items-center justify-center rounded-tr-card rounded-bl-badge bg-primary text-primary-foreground",
        className,
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  );
}
