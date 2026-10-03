import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

/**
 * Workshop buttons. Solid, flat, 4px corners, 19px bold sentence-case labels.
 * Press feedback is a background change over 120ms, never a scale or bounce.
 * `primary` is the only place the orange fill is allowed, besides the check badge.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-button border-2 px-5 text-button font-bold whitespace-nowrap transition-colors duration-(--dur-press) ease-standard select-none disabled:pointer-events-none disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover",
        secondary:
          "border-border-strong bg-card text-foreground hover:bg-muted active:bg-muted aria-expanded:bg-muted",
        ghost:
          "border-transparent bg-transparent text-foreground hover:bg-muted active:bg-muted aria-expanded:bg-muted",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/90",
        link: "h-auto min-h-target rounded-badge border-transparent bg-transparent px-1 text-foreground underline underline-offset-4 hover:bg-muted",
      },
      size: {
        /** Primary actions: 56px. The default. */
        lg: "h-target-lg",
        /** Secondary actions inside content: 48px. */
        md: "h-target px-4 text-label",
        /** Icon-only, 48px square. Give it an aria-label. */
        icon: "size-target px-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "lg",
    },
  },
);

function Button({
  className,
  variant = "primary",
  size = "lg",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
