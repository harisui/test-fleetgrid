// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EnvValidationError,
  getClientEnv,
  getServerEnv,
  parseClientEnv,
  parseServerEnv,
  resetEnvCache,
} from "@/lib/env";

const validClient = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

const validServer = {
  ...validClient,
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

function issuesOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvValidationError) return error.issues;
    throw error;
  }
  throw new Error("expected EnvValidationError");
}

describe("parseClientEnv", () => {
  it("accepts a valid client environment", () => {
    expect(parseClientEnv(validClient)).toEqual(validClient);
  });

  it("ignores unrelated variables", () => {
    expect(parseClientEnv({ ...validClient, PATH: "/usr/bin" })).toEqual(validClient);
  });

  it.each(Object.keys(validClient))("rejects a missing %s", (key) => {
    const source: Record<string, string | undefined> = { ...validClient, [key]: undefined };
    expect(issuesOf(() => parseClientEnv(source))).toEqual([expect.stringContaining(key)]);
  });

  it.each(Object.keys(validClient))("treats an empty %s as missing", (key) => {
    const source = { ...validClient, [key]: "   " };
    expect(issuesOf(() => parseClientEnv(source))).toEqual([`${key} is required`]);
  });

  it.each(["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SUPABASE_URL"])(
    "rejects a malformed URL in %s",
    (key) => {
      const source = { ...validClient, [key]: "not a url" };
      expect(issuesOf(() => parseClientEnv(source))).toEqual([`${key} must be a valid URL`]);
    },
  );

  it("does not require the Stripe publishable key in Milestone 1", () => {
    expect(parseClientEnv({ ...validClient, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "" })).toEqual(
      validClient,
    );
  });
});

describe("parseServerEnv", () => {
  it("accepts a valid server environment", () => {
    expect(parseServerEnv(validServer)).toEqual(validServer);
  });

  it("rejects a missing service role key", () => {
    expect(issuesOf(() => parseServerEnv(validClient))).toEqual([
      "SUPABASE_SERVICE_ROLE_KEY is required",
    ]);
  });

  it("reports every problem at once", () => {
    const issues = issuesOf(() => parseServerEnv({ NEXT_PUBLIC_APP_URL: "nope" }));
    expect(issues).toEqual([
      "NEXT_PUBLIC_APP_URL must be a valid URL",
      "NEXT_PUBLIC_SUPABASE_URL is required",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is required",
      "SUPABASE_SERVICE_ROLE_KEY is required",
    ]);
  });

  it("keeps optional later-milestone variables when present and drops empty ones", () => {
    const parsed = parseServerEnv({
      ...validServer,
      STRIPE_SECRET_KEY: "sk_test_123",
      TWILIO_ACCOUNT_SID: "",
    });
    expect(parsed.STRIPE_SECRET_KEY).toBe("sk_test_123");
    expect(parsed.TWILIO_ACCOUNT_SID).toBeUndefined();
  });

  it("produces a clear, actionable error message", () => {
    expect(() => parseServerEnv({})).toThrowError(/Invalid environment variables:/);
    expect(() => parseServerEnv({})).toThrowError(/\.env\.example/);
  });
});

describe("getServerEnv / getClientEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetEnvCache();
  });

  function stubValidEnv() {
    for (const [key, value] of Object.entries(validServer)) vi.stubEnv(key, value);
  }

  it("reads and caches process.env", () => {
    stubValidEnv();
    const first = getServerEnv();
    expect(first.SUPABASE_SERVICE_ROLE_KEY).toBe("service-role-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "changed");
    expect(getServerEnv()).toBe(first);
  });

  it("fails fast when the environment is invalid", () => {
    stubValidEnv();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => getServerEnv()).toThrowError(EnvValidationError);
  });

  it("getClientEnv returns only public values", () => {
    stubValidEnv();
    const env = getClientEnv();
    expect(env).toEqual(validClient);
    expect(env).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(getClientEnv()).toBe(env);
  });

  it("refuses to expose server env in the browser", () => {
    stubValidEnv();
    vi.stubGlobal("window", {});
    expect(() => getServerEnv()).toThrowError(/never be called in the browser/);
  });
});
