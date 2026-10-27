/**
 * The Google Ads tag (gtag.js), so the client's ads can count sign-ups and subscriptions.
 * Client request of 2026-10-27 ("she wants to run google ads"). The tag id is public, not a
 * secret.
 *
 * Where it loads: the production deployment only (Vercel sets VERCEL_ENV there), or wherever
 * NEXT_PUBLIC_GOOGLE_ADS_ID is set by hand. Never in local development, the browser tests,
 * CI or preview deployments, so Lighthouse and the tests see the site without Google's
 * scripts. "off" switches it off everywhere.
 */

export const GOOGLE_ADS_ID = "AW-18533050920";

export interface AnalyticsEnvSource {
  NEXT_PUBLIC_GOOGLE_ADS_ID?: string;
  VERCEL_ENV?: string;
}

/** The tag id to load on this deployment, or null to load nothing. */
export function googleAdsId(source: AnalyticsEnvSource): string | null {
  const explicit = source.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();
  if (explicit === "off") return null;
  if (explicit) return explicit;
  return source.VERCEL_ENV === "production" ? GOOGLE_ADS_ID : null;
}

/** The inline part of Google's snippet, as Google hands it out, for one tag id. */
export function googleAdsSnippet(id: string): string {
  return [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('js', new Date());",
    `gtag('config', '${id}');`,
  ].join("\n");
}

/**
 * The two conversions Google Ads counts, each its own conversion action there with its own
 * label: a driver finishing the sign-up, and a carrier whose payment is confirmed.
 */
export type ConversionEvent = "signup" | "subscribe";

export interface ConversionEnvSource {
  NEXT_PUBLIC_GOOGLE_ADS_ID?: string;
  NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL?: string;
  NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL?: string;
}

const LABEL_VARIABLES: Record<ConversionEvent, keyof ConversionEnvSource> = {
  signup: "NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL",
  subscribe: "NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL",
};

/**
 * The "send_to" of a conversion: the tag id plus the label from the Google Ads conversion
 * action (the part after the slash in "AW-18533050920/xxxx"). Null until the label is set.
 */
export function conversionTarget(event: ConversionEvent, source: ConversionEnvSource): string | null {
  const label = source[LABEL_VARIABLES[event]]?.trim();
  if (!label) return null;
  const id = source.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();
  if (id === "off") return null;
  return `${id || GOOGLE_ADS_ID}/${label}`;
}

/** Remembers, per browser, that a conversion was sent, so a revisit does not count twice. */
export function conversionSentKey(event: ConversionEvent): string {
  return `fleetgrid-ads-${event}-counted`;
}
