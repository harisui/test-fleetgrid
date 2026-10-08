"use client";

import { useEffect, useState } from "react";
import { normalizeZip } from "@/lib/validation/onboarding.schema";
import { lookupZipAction } from "@/server/actions/driver.actions";

export const ZIP_LOOKUP_DELAY_MS = 250;

/** A ZIP with the city and state the dataset gives it. */
export interface ZipPlace {
  zip: string;
  city: string;
  state: string;
}

export type ZipLookupStatus = "idle" | "pending" | "found" | "missing";

export interface ZipLookupState {
  /** idle: fewer than five digits. pending: asking. found or missing: the dataset's answer. */
  status: ZipLookupStatus;
  zip: string | null;
  place: ZipPlace | null;
  /** False when the ZIP is outside every launch area. Null until the answer is in. */
  inServiceArea: boolean | null;
}

/** The five digits of a ZIP as typed, or null while there are not five yet. */
export function fiveDigits(value: unknown): string | null {
  const normalized = normalizeZip(value);
  return typeof normalized === "string" && /^\d{5}$/.test(normalized) ? normalized : null;
}

interface LookupResult {
  zip: string;
  place: ZipPlace | null;
  inServiceArea: boolean | null;
}

/**
 * Looks a typed ZIP up in the bundled dataset, a moment after the fifth digit. The saved
 * place, when the typed ZIP is the saved one, shows at once while the answer is on its way.
 * A failed request leaves the status pending: the server checks the ZIP again on save.
 */
export function useZipLookup(value: unknown, saved: ZipPlace | null = null): ZipLookupState {
  const zip = fiveDigits(value);
  const [result, setResult] = useState<LookupResult | null>(null);

  useEffect(() => {
    if (!zip) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const lookup = await lookupZipAction(zip);
      if (cancelled || !lookup.ok) return;
      setResult({
        zip,
        place: lookup.data ? { zip, city: lookup.data.city, state: lookup.data.state } : null,
        inServiceArea: lookup.data ? lookup.data.inServiceArea : null,
      });
    }, ZIP_LOOKUP_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [zip]);

  if (!zip) return { status: "idle", zip: null, place: null, inServiceArea: null };
  if (result?.zip === zip) {
    return {
      status: result.place ? "found" : "missing",
      zip,
      place: result.place,
      inServiceArea: result.inServiceArea,
    };
  }
  const place = saved && saved.zip === zip ? saved : null;
  return { status: place ? "found" : "pending", zip, place, inServiceArea: null };
}
