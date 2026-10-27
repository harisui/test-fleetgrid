// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  conversionSentKey,
  conversionTarget,
  GOOGLE_ADS_ID,
  googleAdsId,
  googleAdsSnippet,
} from "@/lib/analytics";

describe("googleAdsId", () => {
  it("loads the client's tag on the production deployment only", () => {
    expect(googleAdsId({ VERCEL_ENV: "production" })).toBe(GOOGLE_ADS_ID);
    expect(googleAdsId({ VERCEL_ENV: "preview" })).toBeNull();
    expect(googleAdsId({ VERCEL_ENV: "development" })).toBeNull();
    expect(googleAdsId({})).toBeNull();
  });

  it("loads a tag set by hand anywhere, and nothing when switched off", () => {
    expect(googleAdsId({ NEXT_PUBLIC_GOOGLE_ADS_ID: "AW-1", VERCEL_ENV: "preview" })).toBe("AW-1");
    expect(googleAdsId({ NEXT_PUBLIC_GOOGLE_ADS_ID: " AW-2 " })).toBe("AW-2");
    expect(googleAdsId({ NEXT_PUBLIC_GOOGLE_ADS_ID: "off", VERCEL_ENV: "production" })).toBeNull();
    expect(googleAdsId({ NEXT_PUBLIC_GOOGLE_ADS_ID: "", VERCEL_ENV: "production" })).toBe(GOOGLE_ADS_ID);
  });
});

describe("googleAdsSnippet", () => {
  it("is Google's inline snippet for the id", () => {
    const snippet = googleAdsSnippet("AW-18533050920");
    expect(snippet).toContain("window.dataLayer = window.dataLayer || [];");
    expect(snippet).toContain("function gtag(){dataLayer.push(arguments);}");
    expect(snippet).toContain("gtag('js', new Date());");
    expect(snippet).toContain("gtag('config', 'AW-18533050920');");
  });
});

describe("conversionTarget", () => {
  it("is the tag id and that event's label, only once the label is configured", () => {
    expect(conversionTarget("signup", {})).toBeNull();
    expect(conversionTarget("signup", { NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "" })).toBeNull();
    expect(conversionTarget("signup", { NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "AbCd" })).toBe(
      `${GOOGLE_ADS_ID}/AbCd`,
    );
    expect(conversionTarget("subscribe", { NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL: " SuB " })).toBe(
      `${GOOGLE_ADS_ID}/SuB`,
    );
  });

  it("keeps the two events apart", () => {
    const both = {
      NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "driver",
      NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL: "carrier",
    };
    expect(conversionTarget("signup", both)).toBe(`${GOOGLE_ADS_ID}/driver`);
    expect(conversionTarget("subscribe", both)).toBe(`${GOOGLE_ADS_ID}/carrier`);
    expect(conversionTarget("subscribe", { NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "driver" })).toBeNull();
    expect(conversionSentKey("signup")).not.toBe(conversionSentKey("subscribe"));
  });

  it("follows a tag set by hand, and sends nothing when the tag is off", () => {
    expect(
      conversionTarget("signup", { NEXT_PUBLIC_GOOGLE_ADS_ID: "AW-1", NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "x" }),
    ).toBe("AW-1/x");
    expect(
      conversionTarget("signup", { NEXT_PUBLIC_GOOGLE_ADS_ID: "off", NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "x" }),
    ).toBeNull();
  });
});
