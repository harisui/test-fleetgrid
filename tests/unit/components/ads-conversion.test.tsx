import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdsConversion } from "@/components/seo/AdsConversion";
import { conversionSentKey, GOOGLE_ADS_ID } from "@/lib/analytics";

describe("AdsConversion", () => {
  const gtag = vi.fn();

  beforeEach(() => {
    gtag.mockClear();
    window.gtag = gtag;
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.gtag;
  });

  it("sends nothing until that event's label is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL", "carrier");
    render(<AdsConversion event="signup" />);
    expect(gtag).not.toHaveBeenCalled();
  });

  it("sends nothing when the tag has not loaded", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL", "AbCd");
    delete window.gtag;
    render(<AdsConversion event="signup" />);
    expect(window.localStorage.getItem(conversionSentKey("signup"))).toBeNull();
  });

  it("counts a sign-up once per browser with the tag id and the sign-up label", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL", "AbCd");
    const { unmount } = render(<AdsConversion event="signup" />);
    expect(gtag).toHaveBeenCalledExactlyOnceWith("event", "conversion", {
      send_to: `${GOOGLE_ADS_ID}/AbCd`,
    });
    expect(window.localStorage.getItem(conversionSentKey("signup"))).toBe(`${GOOGLE_ADS_ID}/AbCd`);
    unmount();
    // The done screen shows again on a later visit: no second conversion.
    render(<AdsConversion event="signup" />);
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it("counts a subscription with its own label, apart from the sign-up", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL", "driver");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SUBSCRIBE_LABEL", "carrier");
    window.localStorage.setItem(conversionSentKey("signup"), `${GOOGLE_ADS_ID}/driver`);
    render(<AdsConversion event="subscribe" />);
    expect(gtag).toHaveBeenCalledExactlyOnceWith("event", "conversion", {
      send_to: `${GOOGLE_ADS_ID}/carrier`,
    });
  });

  it("still counts when storage is blocked", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL", "AbCd");
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<AdsConversion event="signup" />);
    expect(gtag).toHaveBeenCalledTimes(1);
    getItem.mockRestore();
  });
});
