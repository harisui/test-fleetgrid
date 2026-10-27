"use client";

import { useEffect } from "react";
import { SIGNUP_CONVERSION_SENT_KEY, signupConversionTarget } from "@/lib/analytics";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Tells Google Ads that a driver finished the sign-up, once per browser. Does nothing until
 * the conversion label is configured (NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL) and the tag has
 * loaded, so the tests, previews and local development send nothing.
 */
export function SignupConversion() {
  useEffect(() => {
    // Referenced statically so Next.js inlines the two public variables.
    const sendTo = signupConversionTarget({
      NEXT_PUBLIC_GOOGLE_ADS_ID: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
      NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL,
    });
    if (!sendTo || typeof window.gtag !== "function") return;
    try {
      if (window.localStorage.getItem(SIGNUP_CONVERSION_SENT_KEY) === sendTo) return;
      window.localStorage.setItem(SIGNUP_CONVERSION_SENT_KEY, sendTo);
    } catch {
      // Private mode or blocked storage: still count the sign-up, at worst twice.
    }
    window.gtag("event", "conversion", { send_to: sendTo });
  }, []);
  return null;
}
