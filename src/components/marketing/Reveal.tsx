"use client";

import { Children, cloneElement, isValidElement, useRef, type CSSProperties, type ReactNode } from "react";
import { useReveal } from "@/hooks/useReveal";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** The element to render. A section stays a section. */
  as?: "div" | "section" | "ul" | "li" | "article";
  id?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  "data-slot"?: string;
}

/**
 * Fades a block in the first time it scrolls into view: opacity 0 to 1 and a 12px rise over
 * --motion-slow. The content is in the server HTML and visible unless the page is marked
 * `js-motion`, so nothing depends on JavaScript to be readable. Never wrap the H1 or the
 * hero buttons in it.
 */
export function Reveal({ children, className, as: Tag = "div", ...rest }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  useReveal(ref);
  return (
    <Tag ref={ref as never} data-reveal="" className={cn(className)} {...rest}>
      {children}
    </Tag>
  );
}

/** At most this many steps of delay, so the last child never waits more than 250ms. */
export const STAGGER_CAP = 5;

interface StaggerProps {
  children: ReactNode;
}

/**
 * Gives each child a step of delay (--i times --motion-stagger) so a row of tiles or steps
 * arrives one after the other. Each child should be a Reveal, or carry data-reveal itself.
 */
export function Stagger({ children }: StaggerProps) {
  return Children.map(children, (child, index) => {
    if (!isValidElement<{ style?: CSSProperties }>(child)) return child;
    const style = { ...child.props.style, "--i": Math.min(index, STAGGER_CAP) } as CSSProperties;
    return cloneElement(child, { style });
  });
}
