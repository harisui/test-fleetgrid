// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CARRIER_COMING_SOON_PATH as ROUTES_PATH } from "@/lib/auth/routes";
import { CARRIER_COMING_SOON_PATH, isCarrierDisabled } from "@/lib/carrier/availability";

describe("isCarrierDisabled", () => {
  it("follows the CARRIER_DISABLED flag", () => {
    expect(isCarrierDisabled({ CARRIER_DISABLED: true })).toBe(true);
    expect(isCarrierDisabled({ CARRIER_DISABLED: false })).toBe(false);
  });

  it("the coming soon path is the one the route rules redirect to", () => {
    expect(CARRIER_COMING_SOON_PATH).toBe("/carriers");
    expect(CARRIER_COMING_SOON_PATH).toBe(ROUTES_PATH);
  });
});
