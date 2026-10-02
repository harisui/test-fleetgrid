import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { AuthRepository, toE164 } from "@/server/repositories/AuthRepository";
import { TEST_OTP, TEST_PHONES } from "../../setup/factories";
import {
  cleanupTestUsers,
  deleteUserByPhone,
  freshClient,
  trackUserForCleanup,
} from "../../setup/supabase";

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

// Dedicated test OTP numbers, so this file never collides with e2e tests (which use 0100 and 0101).
// Each test uses its own number: Supabase limits how often one number can request a code.
const PHONE = TEST_PHONES.extra[0];
const SECOND_PHONE = TEST_PHONES.extra[1];
const WRONG_CODE_PHONE = TEST_PHONES.extra[2];
const RESEND_PHONE = TEST_PHONES.extra[3];
const UNLISTED_PHONE = "+15555559877";
const ALL_PHONES = [PHONE, SECOND_PHONE, WRONG_CODE_PHONE, RESEND_PHONE, UNLISTED_PHONE];

/** Longer than auth.sms.max_frequency (1s) in supabase/config.toml. */
const waitForResendWindow = () => new Promise((resolve) => setTimeout(resolve, 1200));

describe("AuthRepository (local Supabase, test OTP numbers only)", () => {
  beforeAll(async () => {
    for (const phone of ALL_PHONES) await deleteUserByPhone(phone);
  });

  afterAll(async () => {
    await cleanupTestUsers();
    for (const phone of ALL_PHONES) await deleteUserByPhone(phone);
  });

  it("getUser is null without a session", async () => {
    await expect(new AuthRepository(freshClient()).getUser()).resolves.toBeNull();
  });

  it("sendOtp, verifyOtp, getUser and signOut work end to end", async () => {
    const repository = new AuthRepository(freshClient());

    await repository.sendOtp(PHONE);
    const user = await repository.verifyOtp(PHONE, TEST_OTP);
    trackUserForCleanup(user.id);

    expect(user.phone).toBe(PHONE);
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(repository.getUser()).resolves.toEqual(user);

    await repository.signOut();
    await expect(repository.getUser()).resolves.toBeNull();
  });

  it("signing in again returns the same user", async () => {
    const first = new AuthRepository(freshClient());
    await first.sendOtp(SECOND_PHONE);
    const userA = await first.verifyOtp(SECOND_PHONE, TEST_OTP);
    trackUserForCleanup(userA.id);

    await waitForResendWindow();
    const second = new AuthRepository(freshClient());
    await second.sendOtp(SECOND_PHONE);
    const userB = await second.verifyOtp(SECOND_PHONE, TEST_OTP);
    expect(userB).toEqual(userA);
  });

  it("verifyOtp maps a wrong code to VALIDATION on the code field", async () => {
    const repository = new AuthRepository(freshClient());
    await repository.sendOtp(WRONG_CODE_PHONE);

    const error = await expectAppError(repository.verifyOtp(WRONG_CODE_PHONE, "000000"));
    expect(error.code).toBe("VALIDATION");
    expect(error.fieldErrors).toEqual({ code: "That code is incorrect or has expired" });
    await expect(repository.getUser()).resolves.toBeNull();
  });

  it("sendOtp maps an immediate resend to RATE_LIMITED", async () => {
    const repository = new AuthRepository(freshClient());
    await repository.sendOtp(RESEND_PHONE);

    const error = await expectAppError(repository.sendOtp(RESEND_PHONE));
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.message).toBe("Too many attempts. Please wait a minute and try again.");

    await waitForResendWindow();
    await expect(repository.sendOtp(RESEND_PHONE)).resolves.toBeUndefined();
  });

  it("verifyOtp fails for a phone that never requested a code", async () => {
    const repository = new AuthRepository(freshClient());
    const error = await expectAppError(repository.verifyOtp("+15555559876", TEST_OTP));
    expect(error.code).toBe("VALIDATION");
  });

  it("sendOtp to a number outside the test list fails instead of sending a real SMS", async () => {
    const repository = new AuthRepository(freshClient());
    const error = await expectAppError(repository.sendOtp(UNLISTED_PHONE));
    expect(["VALIDATION", "INTERNAL"]).toContain(error.code);
    expect(error.message).not.toMatch(/twilio/i);
  });

  it("toE164 adds the plus Supabase leaves out", () => {
    expect(toE164("15555550100")).toBe("+15555550100");
    expect(toE164("+15555550100")).toBe("+15555550100");
  });
});
