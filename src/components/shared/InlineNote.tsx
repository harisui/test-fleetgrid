import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type NoteVariant = "info" | "warning" | "success" | "error";

const VARIANTS: Record<NoteVariant, { icon: LucideIcon; className: string; iconClass: string }> = {
  info: { icon: Info, className: "border-info bg-info-subtle", iconClass: "text-info" },
  warning: {
    icon: TriangleAlert,
    className: "border-warning bg-warning-subtle",
    iconClass: "text-warning",
  },
  success: {
    icon: CircleCheck,
    className: "border-success bg-success-subtle",
    iconClass: "text-success",
  },
  error: {
    icon: CircleAlert,
    className: "border-destructive bg-destructive-subtle",
    iconClass: "text-destructive",
  },
};

interface InlineNoteProps extends Omit<ComponentProps<"div">, "children"> {
  variant: NoteVariant;
  children: ReactNode;
}

/** A short message with an icon and a subtle fill. Status is shown by the icon and the words, not the color alone. */
export function InlineNote({ variant, children, className, ...props }: InlineNoteProps) {
  const { icon: Icon, className: variantClass, iconClass } = VARIANTS[variant];
  return (
    <div
      data-slot="inline-note"
      data-variant={variant}
      className={cn(
        "flex items-start gap-3 rounded-card border p-3 text-helper leading-helper text-foreground",
        variantClass,
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", iconClass)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
