"use client";

import { useEffect, useRef } from "react";

export const SCROLLED_ATTRIBUTE = "data-scrolled";

/**
 * An 8px sentinel at the top of the page. When it leaves the viewport the sticky header
 * gets `data-scrolled`, which fades its shadow in over --motion-base (no scroll listener).
 */
export function HeaderShadow() {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = sentinel.current;
    const header = document.querySelector<HTMLElement>("[data-slot=site-header]");
    if (!element || !header || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      header.toggleAttribute(SCROLLED_ATTRIBUTE, !entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={sentinel}
      aria-hidden="true"
      data-slot="scroll-sentinel"
      className="pointer-events-none absolute top-0 left-0 h-2 w-px"
    />
  );
}
