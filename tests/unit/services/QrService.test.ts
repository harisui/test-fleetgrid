// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import type { AuditEntryInput } from "@/server/repositories/AdminRepository";
import { QrService } from "@/server/services/QrService";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeQrLinkRepository, FakeQrScanRepository } from "../../fakes/FakeQrRepositories";
import { buildProfile, CARRIER_USER_ID, USER_ID } from "../../setup/factories";

const ADMIN_ID = "33333333-3333-4333-8333-333333333333";

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("QrService", () => {
  let links: FakeQrLinkRepository;
  let scans: FakeQrScanRepository;
  let audit: AuditEntryInput[];
  let service: QrService;

  beforeEach(() => {
    links = new FakeQrLinkRepository();
    scans = new FakeQrScanRepository();
    audit = [];
    service = new QrService(
      links,
      scans,
      new FakeProfileRepository([
        buildProfile({ id: ADMIN_ID, role: "admin", phone: "+15555550102", status: "approved" }),
        buildProfile({ id: USER_ID }),
        buildProfile({ id: CARRIER_USER_ID, role: "carrier", phone: "+15555550101" }),
      ]),
      async (entry) => {
        audit.push(entry);
      },
      { siteUrl: "https://fleetgridus.com", ipHashSalt: "test-salt" },
    );
  });

  it("is for admins only", async () => {
    for (const who of [USER_ID, CARRIER_USER_ID, "nobody"]) {
      expect((await expectAppError(service.listLinks(who))).code).toBe("FORBIDDEN");
      expect((await expectAppError(service.createLink(who, { locationName: "Love's", campaign: "", targetPath: "", slug: "" }))).code).toBe("FORBIDDEN");
      expect((await expectAppError(service.setActive(who, { qrLinkId: "aaaaaaaa-0000-4000-8000-000000000001", isActive: false }))).code).toBe("FORBIDDEN");
    }
    expect(links.rows.size).toBe(0);
  });

  describe("createLink", () => {
    it("makes the slug from the location, keeps the defaults, and logs it", async () => {
      const link = await service.createLink(ADMIN_ID, { locationName: "Love's, Hwy 225", campaign: "", targetPath: "", slug: "" });
      expect(link).toMatchObject({
        slug: "loves-hwy-225",
        locationName: "Love's, Hwy 225",
        campaign: "pasadena-225",
        targetPath: "/",
        utmSource: "flyer",
        utmMedium: "qr",
        isActive: true,
        createdBy: ADMIN_ID,
      });
      expect(service.shortLink(link)).toBe("https://fleetgridus.com/q/loves-hwy-225");
      expect(audit).toEqual([
        expect.objectContaining({
          adminId: ADMIN_ID,
          adminPhone: "+15555550102",
          action: "qr_link_created",
          targetType: "qr_link",
          targetId: link.id,
          detail: { slug: "loves-hwy-225", locationName: "Love's, Hwy 225", campaign: "pasadena-225" },
        }),
      ]);
    });

    it("takes a slug, a campaign and a page when given", async () => {
      const link = await service.createLink(ADMIN_ID, { locationName: "Pilot Baytown", campaign: "Baytown-146", targetPath: "/drivers", slug: "Pilot-146" });
      expect(link).toMatchObject({ slug: "pilot-146", campaign: "baytown-146", targetPath: "/drivers" });
    });

    it("refuses a used slug, with the field named", async () => {
      await service.createLink(ADMIN_ID, { locationName: "Love's, Hwy 225", campaign: "", targetPath: "", slug: "" });
      const error = await expectAppError(
        service.createLink(ADMIN_ID, { locationName: "Love's Hwy 225", campaign: "", targetPath: "", slug: "" }),
      );
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual({ slug: "That short link is already used. Change the slug." });
      expect(links.rows.size).toBe(1);
    });

    it("refuses a name that leaves no slug, and bad input", async () => {
      const empty = await expectAppError(service.createLink(ADMIN_ID, { locationName: "!!", campaign: "", targetPath: "", slug: "" }));
      expect(empty.fieldErrors).toHaveProperty("slug");
      const bad = await expectAppError(service.createLink(ADMIN_ID, { locationName: "L", campaign: "", targetPath: "", slug: "" }));
      expect(bad.fieldErrors).toHaveProperty("locationName");
      expect(audit).toEqual([]);
    });
  });

  describe("setActive", () => {
    it("switches a code off and on, logging each change and skipping no-ops", async () => {
      const link = await service.createLink(ADMIN_ID, { locationName: "Love's, Hwy 225", campaign: "", targetPath: "", slug: "" });
      const off = await service.setActive(ADMIN_ID, { qrLinkId: link.id, isActive: false });
      expect(off.isActive).toBe(false);
      const same = await service.setActive(ADMIN_ID, { qrLinkId: link.id, isActive: false });
      expect(same.isActive).toBe(false);
      const on = await service.setActive(ADMIN_ID, { qrLinkId: link.id, isActive: true });
      expect(on.isActive).toBe(true);
      expect(audit.map((entry) => entry.action)).toEqual(["qr_link_created", "qr_link_deactivated", "qr_link_activated"]);
    });

    it("answers not found for an unknown code", async () => {
      expect(
        (await expectAppError(service.setActive(ADMIN_ID, { qrLinkId: "aaaaaaaa-0000-4000-8000-000000000009", isActive: false }))).code,
      ).toBe("NOT_FOUND");
    });
  });

  describe("resolveScan", () => {
    it("logs a scan of a known, active code with the address hashed, and sends the visitor on with the tags", async () => {
      const link = await service.createLink(ADMIN_ID, { locationName: "Love's, Hwy 225", campaign: "", targetPath: "", slug: "" });
      const outcome = await service.resolveScan({ slug: "LOVES-HWY-225 ", ip: "203.0.113.9", userAgent: "x".repeat(600) });
      expect(outcome).toEqual({
        to: "/?utm_source=flyer&utm_medium=qr&utm_campaign=pasadena-225&utm_content=loves-hwy-225",
        tagged: true,
      });
      expect(scans.recorded).toHaveLength(1);
      expect(scans.recorded[0].qrLinkId).toBe(link.id);
      expect(scans.recorded[0].ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(scans.recorded[0].ipHash).not.toContain("203");
      expect(scans.recorded[0].userAgent).toHaveLength(500);
    });

    it("sends an unknown or inactive code to the home page, untagged and unlogged", async () => {
      const link = await service.createLink(ADMIN_ID, { locationName: "Love's, Hwy 225", campaign: "", targetPath: "", slug: "" });
      await service.setActive(ADMIN_ID, { qrLinkId: link.id, isActive: false });
      expect(await service.resolveScan({ slug: "loves-hwy-225", ip: null, userAgent: null })).toEqual({ to: "/", tagged: false });
      expect(await service.resolveScan({ slug: "nothing-here", ip: null, userAgent: null })).toEqual({ to: "/", tagged: false });
      expect(scans.recorded).toEqual([]);
    });

    it("keeps a scan without an address or a browser", async () => {
      await service.createLink(ADMIN_ID, { locationName: "Love's, Hwy 225", campaign: "", targetPath: "", slug: "" });
      await service.resolveScan({ slug: "loves-hwy-225", ip: null, userAgent: null });
      expect(scans.recorded[0]).toMatchObject({ ipHash: null, userAgent: null });
    });
  });
});
