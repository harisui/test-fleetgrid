// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";
import { getSupportContact } from "@/lib/support";

const BASE = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("getSupportContact", () => {
  it("is empty until the client provides the details", () => {
    expect(getSupportContact({})).toEqual({});
    expect(getSupportContact({ SUPPORT_EMAIL: undefined, SUPPORT_PHONE: undefined })).toEqual({});
  });

  it("carries whichever parts are set", () => {
    expect(getSupportContact({ SUPPORT_EMAIL: "help@fleetgridus.com" })).toEqual({
      email: "help@fleetgridus.com",
    });
    expect(
      getSupportContact({ SUPPORT_EMAIL: "help@fleetgridus.com", SUPPORT_PHONE: "+12145550123" }),
    ).toEqual({ email: "help@fleetgridus.com", phone: "+12145550123" });
  });

  it("reads SUPPORT_EMAIL and SUPPORT_PHONE from the environment, blanks meaning unset", () => {
    expect(
      getSupportContact(parseServerEnv({ ...BASE, SUPPORT_EMAIL: "", SUPPORT_PHONE: "" })),
    ).toEqual({});
    expect(getSupportContact(parseServerEnv({ ...BASE, SUPPORT_PHONE: "+12145550123" }))).toEqual({
      phone: "+12145550123",
    });
  });
});
