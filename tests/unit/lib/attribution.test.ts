// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_SECONDS,
  attributionFromVisit,
  captureAttribution,
  isAttributionPath,
  NO_ATTRIBUTION,
  parseAttribution,
  serializeAttribution,
} from "@/lib/attribution";

const SITE = "https://fleetgridus.com";

describe("attributionFromVisit", () => {
  it("reads the four tags, the landing path and an outside referrer", () => {
    const url = new URL(`${SITE}/drivers?utm_source=flyer&utm_medium=qr&utm_campaign=pasadena-225&utm_content=loves-hwy-225`);
    expect(attributionFromVisit(url, "https://www.google.com/")).toEqual({
      utmSource: "flyer",
      utmMedium: "qr",
      utmCampaign: "pasadena-225",
      utmContent: "loves-hwy-225",
      referrer: "https://www.google.com/",
      landingPath: "/drivers",
    });
  });

  it("ignores our own pages as a referrer, bad referrers, and clips long values", () => {
    expect(attributionFromVisit(new URL(`${SITE}/`), `${SITE}/faq`).referrer).toBeNull();
    expect(attributionFromVisit(new URL(`${SITE}/`), "not a url").referrer).toBeNull();
    expect(attributionFromVisit(new URL(`${SITE}/`), null)).toEqual({ ...NO_ATTRIBUTION, landingPath: "/" });
    const long = attributionFromVisit(new URL(`${SITE}/?utm_source=${"x".repeat(300)}`), null);
    expect(long.utmSource).toHaveLength(200);
    expect(attributionFromVisit(new URL(`${SITE}/?utm_source=%20%20`), null).utmSource).toBeNull();
  });
});

describe("the cookie", () => {
  it("round-trips, compact, and reads back nothing for junk", () => {
    const attribution = {
      utmSource: "flyer",
      utmMedium: "qr",
      utmCampaign: "pasadena-225",
      utmContent: "loves-hwy-225",
      referrer: null,
      landingPath: "/",
    };
    const raw = serializeAttribution(attribution);
    expect(raw).not.toContain(" ");
    expect(parseAttribution(raw)).toEqual(attribution);
    expect(parseAttribution(serializeAttribution(NO_ATTRIBUTION))).toEqual(NO_ATTRIBUTION);
    expect(parseAttribution(undefined)).toBeNull();
    expect(parseAttribution("")).toBeNull();
    expect(parseAttribution("%")).toBeNull();
    expect(parseAttribution(encodeURIComponent("[1,2]"))).toBeNull();
    expect(parseAttribution(encodeURIComponent('{"s":5,"c":"fb"}'))).toEqual({ ...NO_ATTRIBUTION, utmCampaign: "fb" });
  });
});

describe("isAttributionPath", () => {
  it("counts the public pages and the sign-in start, not the API, the framework, the short links or the signed-in areas", () => {
    for (const path of ["/", "/drivers", "/faq", "/login", "/verify", "/choose-role", "/terms"]) {
      expect(isAttributionPath(path), path).toBe(true);
    }
    for (const path of ["/api/health", "/_next/static/x.js", "/q/loves-hwy-225", "/q", "/driver/onboarding", "/carrier", "/admin/drivers"]) {
      expect(isAttributionPath(path), path).toBe(false);
    }
  });
});

describe("captureAttribution", () => {
  const request = (path: string, cookie?: string, referer?: string) =>
    new NextRequest(`${SITE}${path}`, {
      headers: {
        ...(cookie ? { cookie: `${ATTRIBUTION_COOKIE}=${cookie}` } : {}),
        ...(referer ? { referer } : {}),
      },
    });

  it("sets the cookie on a first visit to a public page, for 30 days, first-party only", () => {
    const response = NextResponse.next();
    const set = captureAttribution(request("/?utm_source=flyer&utm_content=loves-hwy-225", undefined, "https://t.co/x"), response, true);
    expect(set).toBe(true);
    const cookie = response.cookies.get(ATTRIBUTION_COOKIE);
    expect(cookie).toMatchObject({ maxAge: ATTRIBUTION_MAX_AGE_SECONDS, httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    expect(parseAttribution(cookie?.value)).toEqual({
      utmSource: "flyer",
      utmMedium: null,
      utmCampaign: null,
      utmContent: "loves-hwy-225",
      referrer: "https://t.co/x",
      landingPath: "/",
    });
  });

  it("never overwrites an earlier first touch, and skips paths that do not count", () => {
    const earlier = serializeAttribution({ ...NO_ATTRIBUTION, utmSource: "first", landingPath: "/" });
    const response = NextResponse.next();
    expect(captureAttribution(request("/drivers?utm_source=second", earlier), response, false)).toBe(false);
    expect(response.cookies.get(ATTRIBUTION_COOKIE)).toBeUndefined();
    expect(captureAttribution(request("/api/health"), response, false)).toBe(false);
    expect(captureAttribution(request("/q/loves-hwy-225"), response, false)).toBe(false);
    expect(captureAttribution(request("/driver/profile"), response, false)).toBe(false);
    expect(response.cookies.get(ATTRIBUTION_COOKIE)).toBeUndefined();
  });

  it("sets a plain first-visit cookie even without tags, so the landing path is known", () => {
    const response = NextResponse.next();
    expect(captureAttribution(request("/faq"), response, false)).toBe(true);
    expect(parseAttribution(response.cookies.get(ATTRIBUTION_COOKIE)?.value)).toEqual({ ...NO_ATTRIBUTION, landingPath: "/faq" });
  });
});
