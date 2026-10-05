"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Within this many pixels of the bottom, there is nothing left to point at. */
const NEAR_BOTTOM = 24;
/** How far one tap scrolls, as a share of the viewport. */
const SCROLL_SHARE = 0.6;

interface ScrollingArrowProps {
  /** Read by screen readers; the arrow itself is the visible hint. */
  label?: string;
  className?: string;
}

/**
 * A graphite tile with a chevron that dips slowly, fixed above the action bar, telling the
 * person there is more of the page below. It shows only while the page can still scroll
 * and disappears once the bottom is in view. Tapping it scrolls on. Reduced motion stops
 * the dip through the shared duration tokens.
 */
export function ScrollingArrow({ label = "Scroll down for more", className }: ScrollingArrowProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => {
      const remaining = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      setVisible(remaining > NEAR_BOTTOM);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // The page grows as answers reveal questions, so watch its height too.
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(() => update()) : null;
    observer?.observe(document.documentElement);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      data-slot="scrolling-arrow"
      onClick={() =>
        window.scrollBy({ top: Math.round(window.innerHeight * SCROLL_SHARE), behavior: "smooth" })
      }
      className={cn(
        "fixed bottom-32 left-1/2 z-40 flex size-target -translate-x-1/2 items-center justify-center rounded-button border-2 border-sign-panel-muted bg-sign-panel text-sign-panel-foreground shadow-2 transition-colors duration-(--dur-state) ease-standard hover:bg-selection",
        className,
      )}
    >
      <ChevronDown aria-hidden="true" className="size-7 animate-nudge" strokeWidth={2.5} />
      <span className="sr-only">{label}</span>
    </button>
  );
}
