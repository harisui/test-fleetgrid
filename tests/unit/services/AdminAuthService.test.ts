// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import type { IAdminAuthRepository, SessionAssurance, TotpEnrollment, TotpFactor } from "@/server/repositories/AdminAuthRepository";
import { AdminAuthService } from "@/server/services/AdminAuthService";
import type { Profile, SessionUser } from "@/types/domain";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { buildProfile } from "../../setup/factories";

const ADMIN_ID = "a0000000-0000-4000-8000-000000000001";
const FACTOR = "f0000000-0000-4000-8000-000000000001";
const NEW_FACTOR = "f0000000-0000-4000-8000-000000000002";

/** Supabase Auth as the service sees it, in memory. */
class FakeAdminAuth implements IAdminAuthRepository {
  passwordOk = true;
  assurance_: SessionAssurance = { level: "aal1", methods: ["password"] };
  factors: TotpFactor[] = [];
  validCodes = new Set(["123456"]);
  password: string | null = null;
  name: string | null = null;
  enrolled = 0;

  async signInWithPassword() {
    return this.passwordOk;
  }
  async assurance() {
    return this.assurance_;
  }
  async verifiedTotpFactors() {
    return this.factors;
  }
  async startTotpEnrollment(): Promise<TotpEnrollment> {
    this.enrolled += 1;
    return { factorId: NEW_FACTOR, qrCode: "data:image/svg+xml;utf8,<svg/>", secret: "ABCDEFGH" };
  }
  async verifyTotp(factorId: string, code: string) {
    if (!this.validCodes.has(code)) return false;
    if (!this.factors.some((factor) => factor.id === factorId)) this.factors.push({ id: factorId, friendlyName: null });
    this.assurance_ = { level: "aal2", methods: [...this.assurance_.methods, "totp"] };
    return true;
  }
  async updatePassword(password: string) {
    this.password = password;
  }
  async updateName(name: string) {
    this.name = name;
  }
  async removeTotp(factorId: string) {
    this.factors = this.factors.filter((factor) => factor.id !== factorId);
  }
}

describe("AdminAuthService (0039)", () => {
  let adminAuth: FakeAdminAuth;
  let user: SessionUser | null;
  let signedOut: number;
  let profiles: FakeProfileRepository;
  let service: AdminAuthService;
  const admin = (overrides: Partial<Profile> = {}) => buildProfile({ id: ADMIN_ID, role: "admin", phone: null, email: "boss@fleetgrid.test", status: "approved", ...overrides });

  beforeEach(() => {
    adminAuth = new FakeAdminAuth();
    user = { id: ADMIN_ID, phone: null, email: "boss@fleetgrid.test" };
    signedOut = 0;
    profiles = new FakeProfileRepository([admin()]);
    service = new AdminAuthService(
      {
        getUser: async () => user,
        signOut: async () => {
          signedOut += 1;
        },
      },
      adminAuth,
      profiles,
    );
  });

  describe("signIn", () => {
    it("lets an active admin through to the authenticator step", async () => {
      await expect(service.signIn({ email: " Boss@FleetGrid.test ", password: "secret" })).resolves.toBeUndefined();
      expect(signedOut).toBe(0);
    });

    it("gives one message for a wrong password, a non-admin and a blocked admin, and signs the last two out", async () => {
      const message = { fieldErrors: { password: "That email and password don't match an admin account" } };
      adminAuth.passwordOk = false;
      await expect(service.signIn({ email: "boss@fleetgrid.test", password: "nope" })).rejects.toMatchObject(message);
      adminAuth.passwordOk = true;
      profiles.rows.set(ADMIN_ID, admin({ role: "driver", phone: "+15555550100", email: null }));
      await expect(service.signIn({ email: "boss@fleetgrid.test", password: "secret" })).rejects.toMatchObject(message);
      profiles.rows.set(ADMIN_ID, admin({ status: "blocked" }));
      await expect(service.signIn({ email: "boss@fleetgrid.test", password: "secret" })).rejects.toMatchObject(message);
      expect(signedOut).toBe(2);
    });

    it("refuses a missing email or password before asking anyone", async () => {
      await expect(service.signIn({ email: "", password: "" })).rejects.toMatchObject({ code: "VALIDATION" });
    });
  });

  describe("sessionLevel", () => {
    it("is strong only with a password and the authenticator", async () => {
      expect(await service.sessionLevel()).toBe("needs-code");
      adminAuth.assurance_ = { level: "aal2", methods: ["password", "totp"] };
      expect(await service.sessionLevel()).toBe("strong");
      adminAuth.assurance_ = { level: "aal2", methods: ["otp", "totp"] };
      expect(await service.sessionLevel()).toBe("needs-password");
      adminAuth.assurance_ = { level: "aal1", methods: ["otp"] };
      expect(await service.sessionLevel()).toBe("needs-password");
    });
  });

  describe("the authenticator step", () => {
    it("sets one up on the first sign-in, then verifies with it", async () => {
      expect(await service.verifyState()).toEqual({ mode: "enroll" });
      const enrollment = await service.startEnrollment();
      await expect(service.verifyCode({ factorId: enrollment.factorId, code: "000000" })).rejects.toMatchObject({
        fieldErrors: { code: "That code didn't work. Check your app and try the newest code." },
      });
      await service.verifyCode({ factorId: enrollment.factorId, code: "123 456" });
      expect(await service.sessionLevel()).toBe("strong");
      expect(await service.verifyState()).toEqual({ mode: "verify", factorId: NEW_FACTOR });
    });

    it("does not set up a second one through the sign-in, and refuses a phone-code session", async () => {
      adminAuth.factors = [{ id: FACTOR, friendlyName: null }];
      await expect(service.startEnrollment()).rejects.toMatchObject({ code: "CONFLICT" });
      adminAuth.assurance_ = { level: "aal1", methods: ["otp"] };
      await expect(service.verifyCode({ factorId: FACTOR, code: "123456" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("account settings (a strong session only)", () => {
    beforeEach(() => {
      adminAuth.factors = [{ id: FACTOR, friendlyName: null }];
      adminAuth.assurance_ = { level: "aal2", methods: ["password", "totp"] };
    });

    it("changes the name and the password", async () => {
      await service.changeName({ name: "  Annie Hetzler " });
      expect(adminAuth.name).toBe("Annie Hetzler");
      await expect(service.changePassword({ password: "short", confirm: "short" })).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(service.changePassword({ password: "a-long-new-password", confirm: "another-long-one" })).rejects.toMatchObject({
        fieldErrors: { confirm: "The two passwords don't match" },
      });
      await service.changePassword({ password: "a-long-new-password", confirm: "a-long-new-password" });
      expect(adminAuth.password).toBe("a-long-new-password");
    });

    it("replaces the authenticator: the old one goes only once the new one works", async () => {
      const enrollment = await service.startReplacingAuthenticator();
      await expect(service.finishReplacingAuthenticator({ factorId: enrollment.factorId, code: "000000" })).rejects.toMatchObject({ code: "VALIDATION" });
      expect(adminAuth.factors.map((factor) => factor.id)).toEqual([FACTOR]);
      await service.finishReplacingAuthenticator({ factorId: enrollment.factorId, code: "123456" });
      expect(adminAuth.factors.map((factor) => factor.id)).toEqual([NEW_FACTOR]);
    });

    it("is closed to a session that has not passed the authenticator", async () => {
      adminAuth.assurance_ = { level: "aal1", methods: ["password"] };
      await expect(service.changeName({ name: "Someone" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.changePassword({ password: "a-long-new-password", confirm: "a-long-new-password" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(service.startReplacingAuthenticator()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
