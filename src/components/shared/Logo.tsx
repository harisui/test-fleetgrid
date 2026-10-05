import { LOGO } from "@/components/shared/logo-geometry";
import { cn } from "@/lib/utils";

interface LogoProps {
  /** Rendered height in pixels; the width follows the logo's proportions. */
  height?: number;
  className?: string;
}

/**
 * The FleetGrid logo: the name painted on the side of an orange trailer, a solid cab and three
 * wheels. Drawn inline from the outlined wordmark so it needs no font, and painted with the
 * sign-panel tokens, because every header that shows it is the graphite panel. Read as one
 * image named "FleetGrid".
 */
export function Logo({ height = 32, className }: LogoProps) {
  const width = Math.round((LOGO.width * height) / LOGO.height);
  return (
    <svg
      role="img"
      aria-label="FleetGrid"
      data-slot="logo"
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
        className="fill-sign-panel-border"
      />
      <path d={LOGO.cab} className="fill-sign-panel-foreground" />
      {LOGO.wheels.cx.map((cx) => (
        <g key={cx}>
          <circle
            cx={cx}
            cy={LOGO.wheels.cy}
            r={LOGO.wheels.r}
            className="fill-sign-panel-foreground"
          />
          <circle cx={cx} cy={LOGO.wheels.cy} r={LOGO.wheels.hub} className="fill-sign-panel" />
        </g>
      ))}
      <path d={LOGO.wordmark} className="fill-sign-panel" />
    </svg>
  );
}
