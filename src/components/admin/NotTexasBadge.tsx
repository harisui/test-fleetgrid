import { TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** "Not Texas CDL" (CR-5): a CDL issued outside Texas, which keeps a driver from Shift-Ready without an override. */
export function NotTexasBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={cn(className)} data-slot="not-texas">
      <TriangleAlert aria-hidden="true" />
      Not Texas CDL
    </Badge>
  );
}
