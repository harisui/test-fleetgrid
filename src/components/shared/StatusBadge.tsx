import { Ban, CircleCheck, Clock, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AccountStatus } from "@/types/domain";

interface StatusStyle {
  label: string;
  icon: LucideIcon;
  variant: "warning" | "success" | "destructive";
}

const STATUS_STYLES: Record<AccountStatus, StatusStyle> = {
  pending: { label: "Pending review", icon: Clock, variant: "warning" },
  approved: { label: "Approved", icon: CircleCheck, variant: "success" },
  blocked: { label: "Blocked", icon: Ban, variant: "destructive" },
};

interface StatusBadgeProps {
  status: AccountStatus;
  /** Overrides the default label for the status. */
  label?: string;
  size?: "default" | "lg";
  className?: string;
}

/** Icon plus word, with a subtle fill. The state is readable without the color. */
export function StatusBadge({ status, label, size = "default", className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status];
  const Icon = style.icon;

  return (
    <Badge variant={style.variant} size={size} data-status={status} className={className}>
      <Icon aria-hidden="true" />
      {label ?? style.label}
    </Badge>
  );
}
