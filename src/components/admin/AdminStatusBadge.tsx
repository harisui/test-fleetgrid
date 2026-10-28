import { CircleDashed } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import type { AccountStatus } from "@/types/domain";

/** The review states plus "incomplete": a card that is not finished cannot be approved. */
export type AdminBadgeStatus = AccountStatus | "incomplete";

const REVIEW_LABELS: Record<AccountStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  blocked: "Blocked",
};

/** Icon and text, never color alone: clock, check, ban, or the dashed circle for incomplete. */
export function AdminStatusBadge({ status, className }: { status: AdminBadgeStatus; className?: string }) {
  if (status === "incomplete") {
    return (
      <Badge variant="secondary" data-status="incomplete" className={className}>
        <CircleDashed aria-hidden="true" />
        Incomplete
      </Badge>
    );
  }
  return <StatusBadge status={status} label={REVIEW_LABELS[status]} className={className} />;
}
