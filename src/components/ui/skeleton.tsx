import { cn } from "@/lib/utils";

/** Shaped like the content it stands in for. The pulse is the only motion allowed while loading. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-badge bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
