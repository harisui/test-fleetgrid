import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Usually a button or link. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon: Icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-border-strong px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="flex size-10 items-center justify-center rounded-field bg-muted text-foreground">
          <Icon aria-hidden="true" className="size-6" data-testid="empty-state-icon" />
        </div>
      )}
      <h2 className="text-body leading-body font-semibold">{title}</h2>
      {description && (
        <p className="max-w-sm text-helper leading-helper text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
