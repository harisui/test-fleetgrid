// @vitest-environment node
import { describe, expect, it } from "vitest";
import { testLoginPrefill } from "@/lib/auth/prefill";

const env = { ENABLE_TEST_LOGIN: true, TEST_PHONE_DRIVER: "+15555550100", TEST_OTP: "123456" };

describe("testLoginPrefill", () => {
  it("returns the test number and code when the flag is on", () => {
    expect(testLoginPrefill(env)).toEqual({ phone: "+15555550100", code: "123456" });
  });

  it("returns nothing when the flag is off, whatever else is set", () => {
    expect(testLoginPrefill({ ...env, ENABLE_TEST_LOGIN: false })).toEqual({});
  });

  it("leaves a value out when its variable is missing", () => {
    expect(testLoginPrefill({ ...env, TEST_OTP: undefined })).toEqual({
      phone: "+15555550100",
      code: undefined,
    });
  });
});
