// @vitest-environment node
import { describe, expect, it } from "vitest";
import { testLoginPrefill } from "@/lib/auth/prefill";

const env = { PREFILL_TEST_LOGIN: "true", TEST_PHONE_DRIVER: "+15555550100", TEST_OTP: "123456" };

describe("testLoginPrefill", () => {
  it("returns the test number and code when enabled outside production", () => {
    expect(testLoginPrefill(env, "development")).toEqual({
      phone: "+15555550100",
      code: "123456",
    });
    expect(testLoginPrefill(env, "test")).toEqual({ phone: "+15555550100", code: "123456" });
  });

  it("returns nothing unless the flag is exactly true", () => {
    expect(testLoginPrefill({ ...env, PREFILL_TEST_LOGIN: undefined }, "development")).toEqual({});
    expect(testLoginPrefill({ ...env, PREFILL_TEST_LOGIN: "1" }, "development")).toEqual({});
    expect(testLoginPrefill({ ...env, PREFILL_TEST_LOGIN: "false" }, "development")).toEqual({});
  });

  it("never prefills in a production build, whatever the variables say", () => {
    expect(testLoginPrefill(env, "production")).toEqual({});
  });

  it("leaves a value out when its variable is missing", () => {
    expect(testLoginPrefill({ ...env, TEST_OTP: undefined }, "development")).toEqual({
      phone: "+15555550100",
      code: undefined,
    });
  });
});
