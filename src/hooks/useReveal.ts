"use client";

import { useEffect, type RefObject } from "react";

/** The reveal's trigger: 15% of the block in view, measured 10% above the bottom edge. */
export const REVEAL_THRESHOLD = 0.15;
export const REVEAL_ROOT_MARGIN = "0px 0px -10% 0px";
export const REVEALED_ATTRIBUTE = "data-revealed";

let observer: IntersectionObserver | null = null;

/** One IntersectionObserver for every Reveal on the page. Each element is observed once. */
function sharedObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute(REVEALED_ATTRIBUTE, "");
        observer?.unobserve(entry.target);
      }
    },
    { threshold: REVEAL_THRESHOLD, rootMargin: REVEAL_ROOT_MARGIN },
  );
  return observer;
}

/** Test helper: forgets the shared observer so the next hook builds a fresh one. */
export function resetRevealObserver(): void {
  observer?.disconnect();
  observer = null;
}

/**
 * Marks the element `data-revealed` the first time it scrolls into view, then stops
 * watching it. It never hides again. Without IntersectionObserver the element is revealed
 * at once, so nothing can stay hidden.
 */
export function useReveal(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || element.hasAttribute(REVEALED_ATTRIBUTE)) return;
    const io = sharedObserver();
    if (!io) {
      element.setAttribute(REVEALED_ATTRIBUTE, "");
      return;
    }
    io.observe(element);
    return () => io.unobserve(element);
  }, [ref]);
}
