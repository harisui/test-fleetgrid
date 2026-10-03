"use client";

import { useSyncExternalStore } from "react";

/**
 * True when the media query matches. False on the server and until the browser answers, so
 * the first render is always the phone layout.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(query).matches,
    () => false,
  );
}

/** Tablets and desktops: a mile's questions can share one screen. */
export const DESKTOP_QUERY = "(min-width: 768px)";
