/**
 * The Google Ads tag (gtag.js), so the client's ads can count sign-ups. Client request of
 * 2026-10-27 ("she wants to run google ads"). The tag id is public, not a secret.
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
 * The "send_to" of the sign-up conversion: the tag id plus the conversion label from the
 * Google Ads conversion action ("Website", "Sign-up"). Null until the label is configured.
 */
export function signupConversionTarget(source: {
  NEXT_PUBLIC_GOOGLE_ADS_ID?: string;
  NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL?: string;
}): string | null {
  const label = source.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL?.trim();
  if (!label) return null;
  const id = source.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();
  if (id === "off") return null;
  return `${id || GOOGLE_ADS_ID}/${label}`;
}

/** Remembers, per browser, that the sign-up conversion was sent, so a revisit does not count twice. */
export const SIGNUP_CONVERSION_SENT_KEY = "fleetgrid-signup-counted";
