import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignupConversion } from "@/components/seo/SignupConversion";
import { GOOGLE_ADS_ID, SIGNUP_CONVERSION_SENT_KEY } from "@/lib/analytics";

describe("SignupConversion", () => {
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

  it("sends nothing until the conversion label is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL", "");
    render(<SignupConversion />);
    expect(gtag).not.toHaveBeenCalled();
  });

  it("sends nothing when the tag has not loaded", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL", "AbCd");
    delete window.gtag;
    render(<SignupConversion />);
    expect(window.localStorage.getItem(SIGNUP_CONVERSION_SENT_KEY)).toBeNull();
  });

  it("counts the sign-up once per browser with the tag id and the label", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL", "AbCd");
    const { unmount } = render(<SignupConversion />);
    expect(gtag).toHaveBeenCalledExactlyOnceWith("event", "conversion", {
      send_to: `${GOOGLE_ADS_ID}/AbCd`,
    });
    expect(window.localStorage.getItem(SIGNUP_CONVERSION_SENT_KEY)).toBe(`${GOOGLE_ADS_ID}/AbCd`);
    unmount();
    // The done screen shows again on a later visit: no second conversion.
    render(<SignupConversion />);
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it("still counts when storage is blocked", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL", "AbCd");
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<SignupConversion />);
    expect(gtag).toHaveBeenCalledTimes(1);
    getItem.mockRestore();
  });
});
