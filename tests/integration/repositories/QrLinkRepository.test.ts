import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import { QrLinkRepository, QrScanRepository } from "@/server/repositories/QrLinkRepository";
import { cleanupTestUsers, createTestDriver, createTestUser, serviceClient, type TestDriver, type TestUser } from "../../setup/supabase";

describe("QrLinkRepository and QrScanRepository", () => {
  let admin: TestUser;
  let driver: TestDriver;
  const slug = `it-loves-${Date.now()}`;
  const madeIds: string[] = [];

  beforeAll(async () => {
    [admin, driver] = await Promise.all([
      createTestUser({ role: "admin", status: "approved" }),
      createTestDriver({ fullName: "QR Repo Driver" }),
    ]);
  });

  afterAll(async () => {
    if (madeIds.length > 0) await serviceClient().from("qr_links").delete().in("id", madeIds);
    await cleanupTestUsers();
  });

  it("an admin creates, finds, lists and switches a code; a driver sees none", async () => {
    const links = new QrLinkRepository(admin.client);
    const link = await links.create({ slug, locationName: "Love's, Hwy 225", campaign: "pasadena-225", targetPath: "/", createdBy: admin.id });
    madeIds.push(link.id);
    expect(link).toMatchObject({ slug, utmSource: "flyer", utmMedium: "qr", isActive: true, createdBy: admin.id });
    expect((await links.findBySlug(slug))?.id).toBe(link.id);
    expect((await links.findById(link.id))?.slug).toBe(slug);
    expect((await links.list()).map((row) => row.id)).toContain(link.id);

    const off = await links.setActive(link.id, false);
    expect(off.isActive).toBe(false);
    expect(off.updatedAt >= link.updatedAt).toBe(true);

    const duplicate = await links.create({ slug, locationName: "Twice", campaign: "pasadena-225", targetPath: "/", createdBy: admin.id }).catch((error) => error);
    expect(duplicate).toBeInstanceOf(AppError);
    expect((duplicate as AppError).code).toBe("CONFLICT");

    const asDriver = new QrLinkRepository(driver.client);
    expect(await asDriver.list()).toEqual([]);
    expect(await asDriver.findBySlug(slug)).toBeNull();
    const refused = await asDriver.create({ slug: `${slug}-d`, locationName: "Mine", campaign: "pasadena-225", targetPath: "/", createdBy: driver.id }).catch((error) => error);
    expect((refused as AppError).code).toBe("FORBIDDEN");
  });

  it("the service role logs scans, which the admin counts and the driver never sees", async () => {
    const link = (await new QrLinkRepository(admin.client).findBySlug(slug))!;
    const scans = new QrScanRepository(serviceClient());
    const first = await scans.record({ qrLinkId: link.id, ipHash: "a".repeat(64), userAgent: "Mozilla/5.0" });
    await scans.record({ qrLinkId: link.id, ipHash: null, userAgent: null });
    expect(first.qrLinkId).toBe(link.id);

    const asAdmin = new QrScanRepository(admin.client);
    const all = (await asAdmin.listSince()).filter((scan) => scan.qrLinkId === link.id);
    expect(all).toHaveLength(2);
    const recent = (await asAdmin.listSince(new Date(Date.now() - 60_000))).filter((scan) => scan.qrLinkId === link.id);
    expect(recent).toHaveLength(2);
    const none = (await asAdmin.listSince(new Date(Date.now() + 60_000))).filter((scan) => scan.qrLinkId === link.id);
    expect(none).toHaveLength(0);

    const asAdminWriter = await asAdmin.record({ qrLinkId: link.id, ipHash: null, userAgent: null }).catch((error) => error);
    expect((asAdminWriter as AppError).code).toBe("FORBIDDEN");
    expect(await new QrScanRepository(driver.client).listSince()).toEqual([]);
  });
});
