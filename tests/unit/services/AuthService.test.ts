// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { AuthService } from "@/server/services/AuthService";
import { FakeAuthRepository } from "../../fakes/FakeAuthRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { buildProfile, TEST_PHONES } from "../../setup/factories";

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("AuthService", () => {
  let auth: FakeAuthRepository;
  let profiles: FakeProfileRepository;
  let service: AuthService;

  beforeEach(() => {
    auth = new FakeAuthRepository();
    profiles = new FakeProfileRepository();
    service = new AuthService(auth, profiles);
  });

  describe("requestOtp", () => {
    it("normalizes the phone to E.164 and sends a code", async () => {
      await expect(service.requestOtp({ phone: "(555) 555-0100" })).resolves.toEqual({
        phone: "+15555550100",
      });
      expect(auth.sentTo).toEqual(["+15555550100"]);
    });

    it.each([
      [{ phone: "" }, "Enter your mobile number"],
      [{ phone: "12345" }, "Enter a valid US mobile number"],
      [{ phone: "+447911123456" }, "Enter a valid US mobile number"],
      [{}, "Enter your mobile number"],
      [null, undefined],
    ])("rejects %j without sending anything", async (input, message) => {
      const error = await expectAppError(service.requestOtp(input));
      expect(error.code).toBe("VALIDATION");
      if (message) expect(error.fieldErrors).toEqual({ phone: message });
      expect(auth.sentTo).toEqual([]);
    });

    it("passes rate limiting through", async () => {
      auth.failNextSendWith = AppError.rateLimited();
      const error = await expectAppError(service.requestOtp({ phone: "5555550100" }));
      expect(error.code).toBe("RATE_LIMITED");
    });

    it("allows a resend", async () => {
      await service.requestOtp({ phone: "5555550100" });
      await service.requestOtp({ phone: "5555550100" });
      expect(auth.sentTo).toHaveLength(2);
    });
  });

  describe("verifyOtp", () => {
    beforeEach(async () => {
      await service.requestOtp({ phone: TEST_PHONES.driver });
    });

    it("signs in a new user and sends them to choose a role", async () => {
      const result = await service.verifyOtp({ phone: "(555) 555-0100", code: "123456" });
      expect(result.user.phone).toBe(TEST_PHONES.driver);
      expect(result.profile).toBeNull();
      expect(result.redirectTo).toBe("/choose-role");
      expect(auth.currentUser).toEqual(result.user);
    });

    it.each([
      ["driver", "/driver/profile"],
      ["carrier", "/carrier"],
      ["admin", "/admin"],
    ] as const)("routes an existing %s to %s", async (role, path) => {
      const first = await service.verifyOtp({ phone: TEST_PHONES.driver, code: "123456" });
      profiles.rows.set(first.user.id, buildProfile({ id: first.user.id, role }));

      const result = await service.verifyOtp({ phone: TEST_PHONES.driver, code: "123456" });
      expect(result.profile?.role).toBe(role);
      expect(result.redirectTo).toBe(path);
    });

    it("rejects a wrong code and starts no session", async () => {
      const error = await expectAppError(
        service.verifyOtp({ phone: TEST_PHONES.driver, code: "000000" }),
      );
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual({ code: "That code is incorrect or has expired" });
      expect(auth.currentUser).toBeNull();
    });

    it("rejects a code for a phone that never requested one", async () => {
      const error = await expectAppError(
        service.verifyOtp({ phone: TEST_PHONES.carrier, code: "123456" }),
      );
      expect(error.code).toBe("VALIDATION");
    });

    it.each([
      [{ phone: TEST_PHONES.driver, code: "12345" }, { code: "Enter the 6-digit code" }],
      [{ phone: TEST_PHONES.driver, code: "abcdef" }, { code: "Enter the 6-digit code" }],
      [{ phone: TEST_PHONES.driver }, { code: "Enter the code we texted you" }],
      [{ phone: "nope", code: "123456" }, { phone: "Enter a valid US mobile number" }],
    ])("validates input %j before calling the provider", async (input, fieldErrors) => {
      const error = await expectAppError(service.verifyOtp(input));
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual(fieldErrors);
      expect(auth.currentUser).toBeNull();
    });

    it("signs a blocked user straight out again", async () => {
      const first = await service.verifyOtp({ phone: TEST_PHONES.driver, code: "123456" });
      profiles.rows.set(first.user.id, buildProfile({ id: first.user.id, status: "blocked" }));

      const error = await expectAppError(
        service.verifyOtp({ phone: TEST_PHONES.driver, code: "123456" }),
      );
      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).toMatch(/blocked/);
      expect(auth.currentUser).toBeNull();
      expect(auth.signOutCount).toBe(1);
    });
  });

  describe("session", () => {
    it("getCurrentUser and getSession return null when signed out", async () => {
      await expect(service.getCurrentUser()).resolves.toBeNull();
      await expect(service.getSession()).resolves.toBeNull();
    });

    it("getSession returns the user with a null profile before a role is chosen", async () => {
      await service.requestOtp({ phone: TEST_PHONES.driver });
      const { user } = await service.verifyOtp({ phone: TEST_PHONES.driver, code: "123456" });

      await expect(service.getCurrentUser()).resolves.toEqual(user);
      await expect(service.getSession()).resolves.toEqual({ user, profile: null });
    });

    it("getSession returns the profile once it exists", async () => {
      await service.requestOtp({ phone: TEST_PHONES.driver });
      const { user } = await service.verifyOtp({ phone: TEST_PHONES.driver, code: "123456" });
      const profile = buildProfile({ id: user.id });
      profiles.rows.set(user.id, profile);

      await expect(service.getSession()).resolves.toEqual({ user, profile });
    });

    it("signOut ends the session", async () => {
      await service.requestOtp({ phone: TEST_PHONES.driver });
      await service.verifyOtp({ phone: TEST_PHONES.driver, code: "123456" });
      await service.signOut();
      await expect(service.getCurrentUser()).resolves.toBeNull();
    });
  });
});
