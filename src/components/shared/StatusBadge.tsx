import { Ban, CircleCheck, Clock, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AccountStatus } from "@/types/domain";

interface StatusStyle {
  label: string;
  icon: LucideIcon;
  /** Tinted background with normal text keeps contrast AA in every theme. */
  className: string;
}

const STATUS_STYLES: Record<AccountStatus, StatusStyle> = {
  pending: {
    label: "Pending review",
    icon: Clock,
    className: "border-warning/60 bg-warning/15 text-foreground",
  },
  approved: {
    label: "Approved",
    icon: CircleCheck,
    className: "border-success/60 bg-success/15 text-foreground",
  },
  blocked: {
    label: "Blocked",
    icon: Ban,
    className: "border-destructive/60 bg-destructive/15 text-foreground",
  },
};

interface StatusBadgeProps {
  status: AccountStatus;
  /** Overrides the default label for the status. */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status];
  const Icon = style.icon;

  return (
    <Badge variant="outline" data-status={status} className={cn(style.className, className)}>
      <Icon aria-hidden="true" />
      {label ?? style.label}
    </Badge>
  );
}
