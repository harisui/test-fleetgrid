// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";
import {
  BUSINESS_ADDRESS_DEFAULT,
  BUSINESS_NAME,
  getSupportContact,
  readSupportEnv,
  SUPPORT_EMAIL_DEFAULT,
} from "@/lib/support";

const BASE = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("the business details", () => {
  it("are the ones the client gave on 2026-10-10", () => {
    expect(BUSINESS_NAME).toBe("FleetGrid LLC");
    expect(SUPPORT_EMAIL_DEFAULT).toBe("support@fleetgridus.com");
    expect(BUSINESS_ADDRESS_DEFAULT).toEqual(["8401 Mayland Dr. STE A", "Richmond, VA 23294"]);
  });
});

describe("getSupportContact", () => {
  it("falls back to the client's details when nothing is configured, with no phone number", () => {
    expect(getSupportContact({})).toEqual({
      email: SUPPORT_EMAIL_DEFAULT,
      address: BUSINESS_ADDRESS_DEFAULT,
    });
    expect(getSupportContact({})).not.toHaveProperty("phone");
    expect(getSupportContact({ SUPPORT_EMAIL: " ", SUPPORT_PHONE: "", BUSINESS_ADDRESS: "" })).toEqual(
      getSupportContact({}),
    );
  });

  it("takes whichever parts the environment overrides", () => {
    expect(getSupportContact({ SUPPORT_EMAIL: "help@fleetgridus.com" })).toEqual({
      email: "help@fleetgridus.com",
      address: BUSINESS_ADDRESS_DEFAULT,
    });
    expect(
      getSupportContact({
        SUPPORT_PHONE: "+12145550123",
        BUSINESS_ADDRESS: "1 Main St | Suite 2 | Houston, TX 77002",
      }),
    ).toMatchObject({
      phone: "+12145550123",
      address: ["1 Main St", "Suite 2", "Houston, TX 77002"],
    });
  });

  it("reads the environment, blanks meaning unset, and accepts the validated server env", () => {
    expect(readSupportEnv({ SUPPORT_EMAIL: "", SUPPORT_PHONE: " +12145550123 " })).toEqual({
      SUPPORT_EMAIL: undefined,
      SUPPORT_PHONE: "+12145550123",
      BUSINESS_ADDRESS: undefined,
    });
    expect(getSupportContact(parseServerEnv({ ...BASE, SUPPORT_PHONE: "+12145550123" }))).toEqual({
      email: SUPPORT_EMAIL_DEFAULT,
      phone: "+12145550123",
      address: BUSINESS_ADDRESS_DEFAULT,
    });
  });
});
