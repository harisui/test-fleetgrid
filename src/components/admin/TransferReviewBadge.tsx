import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * "CDL transfer review" (0044): Texas domicile for more than 30 days, a CDL from another state
 * and no transfer applied for. Shift offers wait for an admin's review. A CDL from another state
 * on its own needs nothing (the attorney, 2026-11-14).
 */
export function TransferReviewBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={cn(className)} data-slot="transfer-review">
      <TriangleAlert aria-hidden="true" />
      CDL transfer review
    </Badge>
  );
}
