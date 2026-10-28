import type { NextRequest, NextResponse } from "next/server";
import { requiredRoleFor } from "@/lib/auth/routes";
import type { SignupSource } from "@/types/domain";

/**
 * First-touch attribution (Milestone 3, part 4): on the first visit to a public page the
 * proxy keeps the UTM tags, the referrer and the landing path in a first-party cookie for
 * 30 days, never overwriting an earlier one. When a profile is created, the values move to
 * the profile and the cookie goes. No script, no third party.
 */

export const ATTRIBUTION_COOKIE = "fg_src";
export const ATTRIBUTION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const TAG_MAX = 200;
const PATH_MAX = 500;

/** What the cookie holds: the sign-up source without the QR link, which is looked up at sign-up. */
export type Attribution = Omit<SignupSource, "qrLinkId">;

export const NO_ATTRIBUTION: Attribution = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  referrer: null,
  landingPath: null,
};

const clip = (value: string | null | undefined, max: number): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

/** The attribution of one visit: the tags on the address, the referrer when it is another site, the path. */
export function attributionFromVisit(url: URL, referer: string | null): Attribution {
  let referrer: string | null = null;
  if (referer) {
    try {
      const from = new URL(referer);
      if (from.host !== url.host) referrer = clip(from.toString(), PATH_MAX);
    } catch {
      referrer = null;
    }
  }
  return {
    utmSource: clip(url.searchParams.get("utm_source"), TAG_MAX),
    utmMedium: clip(url.searchParams.get("utm_medium"), TAG_MAX),
    utmCampaign: clip(url.searchParams.get("utm_campaign"), TAG_MAX),
    utmContent: clip(url.searchParams.get("utm_content"), TAG_MAX),
    referrer,
    landingPath: clip(url.pathname, PATH_MAX),
  };
}

/** The cookie value: short keys, URL-encoded JSON. */
export function serializeAttribution(attribution: Attribution): string {
  const compact: Record<string, string> = {};
  if (attribution.utmSource) compact.s = attribution.utmSource;
  if (attribution.utmMedium) compact.m = attribution.utmMedium;
  if (attribution.utmCampaign) compact.c = attribution.utmCampaign;
  if (attribution.utmContent) compact.t = attribution.utmContent;
  if (attribution.referrer) compact.r = attribution.referrer;
  if (attribution.landingPath) compact.l = attribution.landingPath;
  return encodeURIComponent(JSON.stringify(compact));
}

/** The cookie read back, or null when it is missing or not ours. */
export function parseAttribution(raw: string | null | undefined): Attribution | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const field = (key: string, max: number) => (typeof record[key] === "string" ? clip(record[key] as string, max) : null);
    return {
      utmSource: field("s", TAG_MAX),
      utmMedium: field("m", TAG_MAX),
      utmCampaign: field("c", TAG_MAX),
      utmContent: field("t", TAG_MAX),
      referrer: field("r", PATH_MAX),
      landingPath: field("l", PATH_MAX),
    };
  } catch {
    return null;
  }
}

/**
 * Where a first touch counts: the public pages and the sign-in start. Not the API, the
 * framework's own paths, the short links (their redirect carries the tags), or the
 * signed-in areas.
 */
export function isAttributionPath(pathname: string): boolean {
  if (/^\/(api|_next|q)(\/|$)/.test(pathname)) return false;
  return requiredRoleFor(pathname) === null;
}

/** Sets the cookie on the response for a first visit. Returns true when it did. */
export function captureAttribution(request: NextRequest, response: NextResponse, secure: boolean): boolean {
  if (!isAttributionPath(request.nextUrl.pathname)) return false;
  if (request.cookies.get(ATTRIBUTION_COOKIE)) return false;
  const attribution = attributionFromVisit(request.nextUrl, request.headers.get("referer"));
  response.cookies.set(ATTRIBUTION_COOKIE, serializeAttribution(attribution), {
    maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
  return true;
}
