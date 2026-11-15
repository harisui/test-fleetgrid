// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { CURRENT_TERMS, TERMS_VERSIONS } from "@/content/legal/terms";
import { DRIVER_TERMS_MESSAGE, DRIVER_TERMS_STATEMENT } from "@/lib/legal/terms-acceptance";
import { termsLinkText } from "@/lib/shifts/texts";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import type {
  ITermsAdminRepository,
  ITermsRepository,
  LinkAcceptanceOutcome,
  TermsLink,
  TermsVersionInput,
} from "@/server/repositories/TermsRepository";
import { resetTermsPublished, TermsService, termsVersion } from "@/server/services/TermsService";
import { TextService } from "@/server/services/TextService";
import type { DriverAwaitingTerms } from "@/types/domain";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeSmsLog, RecordingSmsProvider } from "../../fakes/FakeShiftRepositories";
import { FakeTosRepository } from "../../fakes/FakeTosRepository";
import { buildProfile, USER_ID } from "../../setup/factories";

const ADMIN_ID = "a0000000-0000-4000-8000-000000000001";
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
// 2 PM in Houston: inside texting hours.
const AFTERNOON = new Date("2026-11-16T20:00:00.000Z");
// 11 PM in Houston: quiet hours.
const NIGHT = new Date("2026-11-17T05:00:00.000Z");

class FakeTermsAdmin implements ITermsAdminRepository {
  archive = new Map<string, TermsVersionInput & { bodySha256: string }>();
  required: string | null = null;
  awaiting: DriverAwaitingTerms[] = [];
  links = new Map<string, TermsLink & { createdBy: string | null }>();
  tamper = false;

  async publish(input: TermsVersionInput) {
    const existing = this.archive.get(input.version);
    if (existing && existing.bodySha256 !== sha256(input.body)) throw new Error("already published with different text");
    const row = existing ?? { ...input, bodySha256: this.tamper ? "0".repeat(64) : sha256(input.body) };
    this.archive.set(input.version, row);
    return { bodySha256: row.bodySha256 };
  }
  async requiredVersion() {
    return this.required;
  }
  async driversAwaiting() {
    return this.awaiting;
  }
  async createLink(input: { profileId: string; version: string; tokenHash: string; expiresAt: string; createdBy: string | null }) {
    for (const link of this.links.values()) {
      if (link.profileId === input.profileId && !link.usedAt) link.expiresAt = AFTERNOON.toISOString();
    }
    this.links.set(input.tokenHash, { profileId: input.profileId, version: input.version, expiresAt: input.expiresAt, usedAt: null, createdBy: input.createdBy });
  }
  async findLink(tokenHash: string) {
    return this.links.get(tokenHash) ?? null;
  }
  accepted: { tokenHash: string; statement: string; ip: string | null }[] = [];
  async acceptByLink(input: { tokenHash: string; ip: string | null; userAgent: string | null; statement: string }) {
    const link = this.links.get(input.tokenHash);
    let outcome: LinkAcceptanceOutcome = "accepted";
    if (!link) outcome = "not_found";
    else if (link.usedAt) outcome = "used";
    else if (new Date(link.expiresAt) <= AFTERNOON) outcome = "expired";
    if (outcome === "accepted" && link) {
      link.usedAt = AFTERNOON.toISOString();
      this.accepted.push({ tokenHash: input.tokenHash, statement: input.statement, ip: input.ip });
    }
    return { outcome, profileId: link?.profileId ?? null };
  }
}

const awaitingDriver = (n: number, overrides: Partial<DriverAwaitingTerms> = {}): DriverAwaitingTerms => ({
  profileId: `e000000${n}-0000-4000-8000-000000000000`,
  driverId: `d000000${n}-0000-4000-8000-000000000000`,
  fullName: `Driver ${n}`,
  phone: `+1555555910${n}`,
  smsOptIn: true,
  smsOptedOut: false,
  lastLinkAt: null,
  ...overrides,
});

describe("TermsService (Milestone 6)", () => {
  let tos: FakeTosRepository;
  let ok: boolean;
  let admin: FakeTermsAdmin;
  let profiles: FakeProfileRepository;
  let audit: AuditEntryInput[];
  let sms: RecordingSmsProvider;
  let now: Date;
  let tokens: string[];
  let service: TermsService;

  beforeEach(() => {
    resetTermsPublished();
    tos = new FakeTosRepository();
    ok = true;
    admin = new FakeTermsAdmin();
    profiles = new FakeProfileRepository([
      buildProfile({ id: ADMIN_ID, role: "admin", status: "approved" }),
      buildProfile({ id: USER_ID, role: "driver", status: "approved" }),
    ]);
    audit = [];
    sms = new RecordingSmsProvider();
    now = AFTERNOON;
    tokens = [TOKEN, "ZyXwVuTsRqPoNmLkJiHgFe", "QqQqQqQqQqQqQqQqQqQqQq"];
    const terms: ITermsRepository = { myTermsOk: async () => ok };
    const log = new FakeSmsLog();
    service = new TermsService(
      tos,
      terms,
      () => admin,
      profiles,
      async (entry) => {
        audit.push(entry);
      },
      () => new TextService(sms, () => log),
      "https://fleetgridus.com",
      () => now,
      () => tokens.shift()!,
    );
  });

  describe("the archive", () => {
    it("archives every published version once per server, with the hash of its exact text", async () => {
      await service.ensurePublished();
      await service.ensurePublished();
      expect([...admin.archive.keys()]).toEqual(TERMS_VERSIONS.map((entry) => entry.version));
      expect(admin.archive.get(CURRENT_TERMS.version)?.bodySha256).toBe(sha256(CURRENT_TERMS.body));
    });

    it("refuses to go on when the stored hash is not the hash of this text, and tries again next time", async () => {
      admin.tamper = true;
      await expect(service.ensurePublished()).rejects.toThrow(/archived text differs/);
      admin.tamper = false;
      admin.archive.clear();
      await expect(service.ensurePublished()).resolves.toBeUndefined();
    });
  });

  describe("a signed-in driver", () => {
    it("is asked only while a version that needs everyone again is not accepted", async () => {
      expect(await service.needsAcceptance()).toBe(false);
      ok = false;
      expect(await service.needsAcceptance()).toBe(true);
    });

    it("accepts the current version with the words, the address and the browser, archived first", async () => {
      const acceptance = await service.accept(USER_ID, "gate", true, { ip: "203.0.113.7", userAgent: "Phone" });
      expect(admin.archive.has(CURRENT_TERMS.version)).toBe(true);
      expect(acceptance).toMatchObject({
        profileId: USER_ID,
        version: CURRENT_TERMS.version,
        ip: "203.0.113.7",
        userAgent: "Phone",
        method: "gate",
        statement: DRIVER_TERMS_STATEMENT,
      });
    });

    it.each([false, "true", undefined, 1])("needs a real tick (%j)", async (accepted) => {
      await expect(service.accept(USER_ID, "signup", accepted, { ip: null, userAgent: null })).rejects.toMatchObject({
        code: "VALIDATION",
        fieldErrors: { accepted: DRIVER_TERMS_MESSAGE },
      });
      expect(tos.rows).toEqual([]);
    });
  });

  describe("the one-time link", () => {
    beforeEach(() => {
      admin.required = CURRENT_TERMS.version;
      admin.awaiting = [awaitingDriver(1), awaitingDriver(2, { smsOptedOut: true }), awaitingDriver(3, { smsOptIn: false })];
    });

    it("texts a fresh link to each driver waiting who has shift texts on, never to a STOP, and audits each", async () => {
      expect(await service.sendLinks(ADMIN_ID)).toEqual({ sent: 1, failed: 0 });
      expect(sms.sent).toEqual([{ to: "+15555559101", body: termsLinkText(`fleetgridus.com/t/${TOKEN}`) }]);
      const link = admin.links.get(sha256(TOKEN))!;
      expect(link).toMatchObject({ profileId: awaitingDriver(1).profileId, version: CURRENT_TERMS.version, usedAt: null, createdBy: ADMIN_ID });
      expect(new Date(link.expiresAt).getTime() - AFTERNOON.getTime()).toBe(14 * 86_400_000);
      // Only the hash is kept.
      expect([...admin.links.keys()]).not.toContain(TOKEN);
      expect(audit).toEqual([
        expect.objectContaining({ adminId: ADMIN_ID, action: "terms_link_sent", targetType: "driver", targetId: awaitingDriver(1).driverId }),
      ]);
    });

    it("sends to one driver when asked, and says why it cannot", async () => {
      expect(await service.sendLinks(ADMIN_ID, awaitingDriver(1).driverId)).toEqual({ sent: 1, failed: 0 });
      await expect(service.sendLinks(ADMIN_ID, awaitingDriver(2).driverId)).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(service.sendLinks(ADMIN_ID, "d0000009-0000-4000-8000-000000000000")).rejects.toThrow("This driver has nothing to accept");
    });

    it("waits for texting hours, needs a version to accept, and is for admins only", async () => {
      now = NIGHT;
      await expect(service.sendLinks(ADMIN_ID)).rejects.toThrow(/between 7 AM and 9 PM/);
      now = AFTERNOON;
      admin.required = null;
      await expect(service.sendLinks(ADMIN_ID)).rejects.toThrow(/No Terms version/);
      await expect(service.sendLinks(USER_ID)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(sms.sent).toEqual([]);
    });

    it("opening the link shows the Terms and records nothing; accepting uses it up", async () => {
      await service.sendLinks(ADMIN_ID);
      expect(await service.linkState(TOKEN)).toEqual({ status: "valid", terms: CURRENT_TERMS });
      expect(admin.accepted).toEqual([]);
      await expect(service.acceptByLink(TOKEN, false, { ip: null, userAgent: null })).rejects.toMatchObject({ code: "VALIDATION" });
      await service.acceptByLink(TOKEN, true, { ip: "198.51.100.4", userAgent: "Phone" });
      expect(admin.accepted).toEqual([{ tokenHash: sha256(TOKEN), statement: DRIVER_TERMS_STATEMENT, ip: "198.51.100.4" }]);
      expect(await service.linkState(TOKEN)).toEqual({ status: "used" });
      await expect(service.acceptByLink(TOKEN, true, { ip: null, userAgent: null })).rejects.toThrow("This link was used already");
    });

    it("a new link ends the driver's earlier one; an unknown or malformed token does not work", async () => {
      await service.sendLinks(ADMIN_ID);
      await service.sendLinks(ADMIN_ID);
      expect(await service.linkState(TOKEN)).toEqual({ status: "expired" });
      expect(await service.linkState("ZyXwVuTsRqPoNmLkJiHgFe")).toMatchObject({ status: "valid" });
      expect(await service.linkState("not-a-token")).toEqual({ status: "not_found" });
      expect(await service.linkState("A".repeat(22))).toEqual({ status: "not_found" });
      await expect(service.acceptByLink("../etc", true, { ip: null, userAgent: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("finds a published version by its id", () => {
    expect(termsVersion(CURRENT_TERMS.version)).toBe(CURRENT_TERMS);
    expect(termsVersion("1999-01-v1")).toBeNull();
  });
});
