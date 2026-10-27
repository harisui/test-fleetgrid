"use client";

import { useEffect } from "react";
import { type ConversionEvent, conversionSentKey, conversionTarget } from "@/lib/analytics";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Tells Google Ads that a conversion happened (a driver finished the sign-up, a carrier's
 * payment was confirmed), once per browser. Does nothing until that event's label is
 * configured and the tag has loaded, so the tests, previews and local development send
 * nothing. Render it only where the event has just happened.
 */
export function AdsConversion({ event }: { event: ConversionEvent }) {
  useEffect(() => {
    // Referenced statically so Next.js inlines the public variables.
    const sendTo = conversionTarget(event, {
      NEXT_PUBLIC_GOOGLE_ADS_ID: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
      NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL,
      NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL: process.env.NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL,
    });
    if (!sendTo || typeof window.gtag !== "function") return;
    const key = conversionSentKey(event);
    try {
      if (window.localStorage.getItem(key) === sendTo) return;
      window.localStorage.setItem(key, sendTo);
    } catch {
      // Private mode or blocked storage: still count it, at worst twice.
    }
    window.gtag("event", "conversion", { send_to: sendTo });
  }, [event]);
  return null;
}
