import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { ProfileRepository } from "@/server/repositories/ProfileRepository";
import { cleanupTestUsers, createTestUser, type TestUser } from "../../setup/supabase";

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("ProfileRepository (local Supabase)", () => {
  let newcomer: TestUser;
  let existing: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    [newcomer, existing, other] = await Promise.all([
      createTestUser(),
      createTestUser({ role: "carrier", status: "approved" }),
      createTestUser({ role: "driver" }),
    ]);
  });

  afterAll(cleanupTestUsers);

  describe("findById", () => {
    it("returns null when the user has no profile", async () => {
      const repository = new ProfileRepository(newcomer.client);
      await expect(repository.findById(newcomer.id)).resolves.toBeNull();
    });

    it("maps the row to a domain Profile", async () => {
      const repository = new ProfileRepository(existing.client);
      const profile = await repository.findById(existing.id);
      expect(profile).toEqual({
        id: existing.id,
        role: "carrier",
        phone: existing.phone,
        status: "approved",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it("returns null for another user's profile (RLS)", async () => {
      const repository = new ProfileRepository(existing.client);
      await expect(repository.findById(other.id)).resolves.toBeNull();
    });
  });

  describe("create", () => {
    it("creates a pending profile for the signed-in user", async () => {
      const repository = new ProfileRepository(newcomer.client);
      const profile = await repository.create({
        id: newcomer.id,
        phone: newcomer.phone,
        role: "driver",
      });
      expect(profile).toMatchObject({
        id: newcomer.id,
        phone: newcomer.phone,
        role: "driver",
        status: "pending",
      });
      await expect(repository.findById(newcomer.id)).resolves.toEqual(profile);
    });

    it("maps a duplicate to CONFLICT", async () => {
      const repository = new ProfileRepository(newcomer.client);
      const error = await expectAppError(
        repository.create({ id: newcomer.id, phone: newcomer.phone, role: "driver" }),
      );
      expect(error.code).toBe("CONFLICT");
      expect(error.message).not.toMatch(/duplicate key|profiles_pkey/);
    });

    it("maps an RLS rejection to FORBIDDEN without leaking details", async () => {
      const stranger = await createTestUser();
      const repository = new ProfileRepository(stranger.client);
      // Creating a profile for someone else is blocked by policy.
      const error = await expectAppError(
        repository.create({ id: other.id, phone: stranger.phone, role: "driver" }),
      );
      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).not.toMatch(/row-level security|policy/i);
    });
  });
});
