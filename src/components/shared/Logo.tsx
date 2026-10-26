import { LOGO } from "@/components/shared/logo-geometry";
import { cn } from "@/lib/utils";

interface LogoProps {
  /** Rendered height in pixels; the width follows the logo's proportions. */
  height?: number;
  className?: string;
  /** panel: on the graphite sign panel (default). page: on the page background. */
  surface?: "panel" | "page";
}

/**
 * The FleetGrid logo: the name painted on the side of an orange trailer, a solid cab and three
 * wheels. Drawn inline from the outlined wordmark so it needs no font. On the graphite panel
 * it is painted with the sign-panel tokens; on the page background with the primary and
 * foreground tokens, so it holds in light and dark mode. Read as one image named "FleetGrid".
 */
export function Logo({ height = 32, className, surface = "panel" }: LogoProps) {
  const width = Math.round((LOGO.width * height) / LOGO.height);
  const paint =
    surface === "panel"
      ? {
          trailer: "fill-sign-panel-border",
          cab: "fill-sign-panel-foreground",
          wheel: "fill-sign-panel-foreground",
          hub: "fill-sign-panel",
          wordmark: "fill-sign-panel",
        }
      : {
          // The progress fill is the same orange as the primary button, in light and dark.
          trailer: "fill-progress-fill",
          cab: "fill-foreground",
          wheel: "fill-foreground",
          hub: "fill-background",
          wordmark: "fill-primary-foreground",
        };
  return (
    <svg
      role="img"
      aria-label="FleetGrid"
      data-slot="logo"
      data-surface={surface}
      width={width}
      height={height}
      viewBox={`0 0 ${LOGO.width} ${LOGO.height}`}
      className={cn("shrink-0", className)}
    >
      <rect
        x={LOGO.trailer.x}
        y={LOGO.trailer.y}
        width={LOGO.trailer.width}
        height={LOGO.trailer.height}
        rx={LOGO.trailer.radius}
        className={paint.trailer}
      />
      <path d={LOGO.cab} className={paint.cab} />
      {LOGO.wheels.cx.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={LOGO.wheels.cy} r={LOGO.wheels.r} className={paint.wheel} />
          <circle cx={cx} cy={LOGO.wheels.cy} r={LOGO.wheels.hub} className={paint.hub} />
        </g>
      ))}
      <path d={LOGO.wordmark} className={paint.wordmark} />
    </svg>
  );
}
