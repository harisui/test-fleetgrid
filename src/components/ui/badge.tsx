import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

/** Rectangular tags with 2px corners. Status variants pair a subtle fill with a 1px rule in the status color. */
const badgeVariants = cva(
  "group/badge inline-flex h-7 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-badge border px-2 text-small leading-small font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-4",
  {
    variants: {
      variant: {
        default: "border-selection bg-selection text-selection-foreground",
        secondary: "border-border bg-muted text-foreground",
        outline: "border-border-strong bg-card text-foreground",
        success: "border-success bg-success-subtle text-foreground",
        warning: "border-warning bg-warning-subtle text-foreground",
        destructive: "border-destructive bg-destructive-subtle text-foreground",
        info: "border-info bg-info-subtle text-foreground",
      },
      size: {
        default: "",
        /** Large status badge for the profile page: 40px tall, 18px text. */
        lg: "h-10 gap-2 px-3 text-body leading-body [&>svg]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
