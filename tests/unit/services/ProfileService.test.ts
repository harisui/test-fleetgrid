// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { ProfileService } from "@/server/services/ProfileService";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { buildProfile, OTHER_USER_ID, TEST_PHONES, USER_ID } from "../../setup/factories";

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const user = { id: USER_ID, phone: TEST_PHONES.driver };

describe("ProfileService", () => {
  let profiles: FakeProfileRepository;
  let service: ProfileService;

  beforeEach(() => {
    profiles = new FakeProfileRepository();
    service = new ProfileService(profiles);
  });

  describe("getProfile / requireProfile", () => {
    it("returns null or throws NOT_FOUND when there is no profile", async () => {
      await expect(service.getProfile(USER_ID)).resolves.toBeNull();
      const error = await expectAppError(service.requireProfile(USER_ID));
      expect(error.code).toBe("NOT_FOUND");
    });

    it("returns the profile when it exists", async () => {
      const profile = buildProfile();
      profiles.rows.set(profile.id, profile);
      await expect(service.getProfile(USER_ID)).resolves.toEqual(profile);
      await expect(service.requireProfile(USER_ID)).resolves.toEqual(profile);
    });
  });

  describe("createProfile", () => {
    it.each(["driver", "carrier"] as const)("creates a pending %s profile", async (role) => {
      const profile = await service.createProfile(user, { role });
      expect(profile).toMatchObject({
        id: USER_ID,
        phone: TEST_PHONES.driver,
        role,
        status: "pending",
      });
      expect(profiles.rows.get(USER_ID)).toEqual(profile);
    });

    it.each([{ role: "admin" }, { role: "" }, {}, null, "driver"])(
      "rejects %j and creates nothing",
      async (input) => {
        const error = await expectAppError(service.createProfile(user, input));
        expect(error.code).toBe("VALIDATION");
        expect(profiles.rows.size).toBe(0);
      },
    );

    it("is idempotent: the same role twice returns the existing profile", async () => {
      const first = await service.createProfile(user, { role: "driver" });
      const second = await service.createProfile(user, { role: "driver" });
      expect(second).toEqual(first);
      expect(profiles.rows.size).toBe(1);
    });

    it("does not let a user switch role afterwards", async () => {
      await service.createProfile(user, { role: "driver" });
      const error = await expectAppError(service.createProfile(user, { role: "carrier" }));
      expect(error.code).toBe("CONFLICT");
      expect(profiles.rows.get(USER_ID)?.role).toBe("driver");
    });

    it("handles two submissions racing: the loser gets the winner's profile", async () => {
      const winner = buildProfile();
      profiles.failNextCreateWith = AppError.conflict();
      // The competing request inserted the row between our lookup and our insert.
      const originalFind = profiles.findById.bind(profiles);
      let calls = 0;
      profiles.findById = async (id) => {
        calls += 1;
        if (calls === 2) profiles.rows.set(winner.id, winner);
        return originalFind(id);
      };

      await expect(service.createProfile(user, { role: "driver" })).resolves.toEqual(winner);
    });

    it("a race lost to a different role is a conflict", async () => {
      profiles.failNextCreateWith = AppError.conflict();
      const originalFind = profiles.findById.bind(profiles);
      let calls = 0;
      profiles.findById = async (id) => {
        calls += 1;
        if (calls === 2) profiles.rows.set(USER_ID, buildProfile({ role: "carrier" }));
        return originalFind(id);
      };

      const error = await expectAppError(service.createProfile(user, { role: "driver" }));
      expect(error.code).toBe("CONFLICT");
    });

    it("rethrows a conflict that is not about this user (phone already used)", async () => {
      profiles.rows.set(OTHER_USER_ID, buildProfile({ id: OTHER_USER_ID }));
      const error = await expectAppError(service.createProfile(user, { role: "driver" }));
      expect(error.code).toBe("CONFLICT");
      expect(profiles.rows.has(USER_ID)).toBe(false);
    });

    it("rethrows unexpected repository errors", async () => {
      profiles.failNextCreateWith = AppError.internal(new Error("db down"));
      const error = await expectAppError(service.createProfile(user, { role: "driver" }));
      expect(error.code).toBe("INTERNAL");
    });
  });

  describe("requireRole", () => {
    it("returns the profile when the role matches", async () => {
      const profile = buildProfile({ role: "carrier", status: "approved" });
      profiles.rows.set(profile.id, profile);
      await expect(service.requireRole(USER_ID, "carrier")).resolves.toEqual(profile);
      await expect(service.requireRole(USER_ID, "driver", "carrier")).resolves.toEqual(profile);
    });

    it.each(["driver", "admin"] as const)(
      "rejects a carrier asking for %s access",
      async (role) => {
        profiles.rows.set(USER_ID, buildProfile({ role: "carrier" }));
        const error = await expectAppError(service.requireRole(USER_ID, role));
        expect(error.code).toBe("FORBIDDEN");
      },
    );

    it("rejects a user without a profile", async () => {
      const error = await expectAppError(service.requireRole(USER_ID, "driver"));
      expect(error.code).toBe("FORBIDDEN");
    });

    it("rejects a blocked user even with the right role", async () => {
      profiles.rows.set(USER_ID, buildProfile({ status: "blocked" }));
      const error = await expectAppError(service.requireRole(USER_ID, "driver"));
      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).toMatch(/blocked/);
    });

    it("allows pending users (approval gates SMS offers, not the app)", async () => {
      profiles.rows.set(USER_ID, buildProfile({ status: "pending" }));
      await expect(service.requireRole(USER_ID, "driver")).resolves.toBeTruthy();
    });
  });
});
