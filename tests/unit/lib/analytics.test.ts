// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  GOOGLE_ADS_ID,
  googleAdsId,
  googleAdsSnippet,
  signupConversionTarget,
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

describe("signupConversionTarget", () => {
  it("is the tag id and the label, only once the label is configured", () => {
    expect(signupConversionTarget({})).toBeNull();
    expect(signupConversionTarget({ NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "" })).toBeNull();
    expect(signupConversionTarget({ NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "AbCd" })).toBe(
      `${GOOGLE_ADS_ID}/AbCd`,
    );
    expect(
      signupConversionTarget({ NEXT_PUBLIC_GOOGLE_ADS_ID: "AW-1", NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "x" }),
    ).toBe("AW-1/x");
    expect(
      signupConversionTarget({ NEXT_PUBLIC_GOOGLE_ADS_ID: "off", NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL: "x" }),
    ).toBeNull();
  });
});
