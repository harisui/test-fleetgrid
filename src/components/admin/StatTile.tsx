import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatTileProps {
  /** The uppercase eyebrow, for example "Pending". */
  label: string;
  value: number | string;
  /** One short line under the number, for example "since Monday". */
  caption?: string;
  className?: string;
}

/** One number the admin scans at a glance: eyebrow, the value in Barlow Condensed with tabular digits, an optional caption. */
export function StatTile({ label, value, caption, className }: StatTileProps) {
  return (
    <div
      data-slot="stat-tile"
      className={cn("flex flex-col gap-1 rounded-card border border-border bg-card p-4", className)}
    >
      <span className="text-eyebrow leading-eyebrow font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="font-heading text-stat leading-stat font-semibold tabular-nums" data-slot="stat-value">
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </span>
      {caption && <span className="text-small leading-small text-muted-foreground">{caption}</span>}
    </div>
  );
}

/** Two columns on a phone, four from lg, six from 2xl where the page asks for it. */
export function StatTileGrid({
  columns = 4,
  children,
  label,
}: {
  columns?: 4 | 6;
  children: ReactNode;
  /** Names the group for screen readers, for example "Driver counts". */
  label: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "grid grid-cols-2 gap-4 lg:grid-cols-4",
        columns === 6 && "xl:grid-cols-6",
      )}
    >
      {children}
    </section>
  );
}
