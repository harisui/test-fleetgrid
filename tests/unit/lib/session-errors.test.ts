// @vitest-environment node
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { classifyAuthError } from "@/lib/auth/session-errors";

describe("classifyAuthError", () => {
  it("reads a missing or dead session as signed out", () => {
    expect(classifyAuthError(new AuthSessionMissingError())).toBe("signed-out");
    // The case behind the login loop: a session for a user that was deleted.
    expect(
      classifyAuthError(new AuthApiError("User from sub claim in JWT does not exist", 403, "user_not_found")),
    ).toBe("signed-out");
    expect(classifyAuthError(new AuthApiError("Invalid Refresh Token: Already Used", 400, "refresh_token_already_used"))).toBe(
      "signed-out",
    );
    expect(classifyAuthError(new AuthApiError("JWT expired", 401, "bad_jwt"))).toBe("signed-out");
  });

  it("reads a network failure or a server error as unavailable, never as signed out", () => {
    expect(classifyAuthError(new AuthRetryableFetchError("fetch failed", 0))).toBe("unavailable");
    expect(classifyAuthError(new AuthApiError("Bad gateway", 502, "unexpected_failure"))).toBe("unavailable");
    expect(classifyAuthError(new TypeError("fetch failed"))).toBe("unavailable");
    expect(classifyAuthError(null)).toBe("unavailable");
  });
});
