import { LOGO } from "@/components/shared/logo-geometry";
import { cn } from "@/lib/utils";

interface LogoProps {
  /** Rendered height in pixels; the width follows the logo's proportions. */
  height?: number;
  className?: string;
  /** panel: on the navy sign panel (default). page: on the page background. */
  surface?: "panel" | "page";
}

/**
 * The FleetGrid logo (the designer's brand identity, 2026-11): the FG mark beside FLEETGRID, the
 * LLC line left off for the screen. Drawn inline from the outlined shapes so it needs no font.
 * On the navy panel the navy parts turn white and the orange stays; on the page background it is
 * painted with the logo tokens, so it holds in light and dark mode. Read as one image named
 * "FleetGrid".
 */
export function Logo({ height = 32, className, surface = "panel" }: LogoProps) {
  const width = Math.round((LOGO.width * height) / LOGO.height);
  const paint =
    surface === "panel"
      ? { ink: "fill-sign-panel-foreground", accent: "fill-sign-panel-border" }
      : { ink: "fill-logo-ink", accent: "fill-logo-accent" };
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
      <g transform={LOGO.mark.transform}>
        <path d={LOGO.mark.ink} className={paint.ink} />
        <path d={LOGO.mark.accent} className={paint.accent} />
      </g>
      <g transform={LOGO.wordmark.transform}>
        <path d={LOGO.wordmark.ink} className={paint.ink} />
        <path d={LOGO.wordmark.accent} className={paint.accent} />
      </g>
    </svg>
  );
}
