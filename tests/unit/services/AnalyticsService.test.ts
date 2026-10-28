// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/server/errors/AppError";
import type { DriverReviewRow } from "@/server/repositories/AdminRepository";
import { AnalyticsService } from "@/server/services/AnalyticsService";
import { NO_SOURCE, type QrLink, type QrScan } from "@/types/domain";
import { FakeAdminRepository } from "../../fakes/FakeAdminRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeQrLinkRepository, FakeQrScanRepository } from "../../fakes/FakeQrRepositories";
import { buildDriver, buildProfile, USER_ID } from "../../setup/factories";

const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
/** Wednesday 2026-10-28, 10:00 in Houston (15:00 UTC). */
const NOW = new Date("2026-10-28T15:00:00.000Z");
const LOVES = "aaaaaaaa-0000-4000-8000-000000000001";
const PILOT = "aaaaaaaa-0000-4000-8000-000000000002";

const link = (id: string, slug: string, locationName: string, createdAt: string): QrLink => ({
  id,
  slug,
  locationName,
  campaign: "pasadena-225",
  targetPath: "/",
  utmSource: "flyer",
  utmMedium: "qr",
  isActive: true,
  createdBy: ADMIN_ID,
  createdAt,
  updatedAt: createdAt,
});

const scan = (n: number, qrLinkId: string, scannedAt: string): QrScan => ({
  id: `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`,
  qrLinkId,
  scannedAt,
});

const row = (
  n: number,
  createdAt: string,
  options: { qrLinkId?: string; campaign?: string; heardFrom?: "flyer" | "google_search"; complete?: boolean; sms?: boolean } = {},
): DriverReviewRow => ({
  driver: buildDriver({
    id: `dddddddd-0000-4000-8000-${String(n).padStart(12, "0")}`,
    profileId: `pppppppp-0000-4000-8000-${String(n).padStart(12, "0")}`,
    fullName: `Driver ${n}`,
    createdAt,
    cardCompleted: options.complete ?? true,
    smsOptIn: options.sms ?? true,
    heardFrom: options.heardFrom ?? null,
  }),
  profile: buildProfile({
    id: `pppppppp-0000-4000-8000-${String(n).padStart(12, "0")}`,
    phone: `+1555555${String(2000 + n)}`,
    source: { ...NO_SOURCE, qrLinkId: options.qrLinkId ?? null, utmCampaign: options.campaign ?? null },
  }),
});

describe("AnalyticsService", () => {
  let service: AnalyticsService;
  let admin: FakeAdminRepository;

  beforeEach(() => {
    admin = new FakeAdminRepository([
      // Today: scanned Love's, finished the card.
      row(1, "2026-10-28T14:00:00.000Z", { qrLinkId: LOVES, campaign: "pasadena-225" }),
      // Monday: scanned Love's, did not finish, declined texts.
      row(2, "2026-10-26T18:00:00.000Z", { qrLinkId: LOVES, campaign: "pasadena-225", complete: false, sms: false }),
      // Three weeks ago: a Facebook campaign, said Google.
      row(3, "2026-10-06T12:00:00.000Z", { campaign: "fb-october", heardFrom: "google_search" }),
      // Last month: direct, said flyer.
      row(4, "2026-09-20T12:00:00.000Z", { heardFrom: "flyer" }),
    ]);
    service = new AnalyticsService(
      admin,
      new FakeProfileRepository([
        buildProfile({ id: ADMIN_ID, role: "admin", phone: "+15555550102", status: "approved" }),
        buildProfile({ id: USER_ID }),
      ]),
      new FakeQrLinkRepository([
        link(LOVES, "loves-hwy-225", "Love's, Hwy 225", "2026-10-20T12:00:00.000Z"),
        link(PILOT, "pilot-baytown", "Pilot, Baytown", "2026-10-25T12:00:00.000Z"),
      ]),
      new FakeQrScanRepository([
        scan(1, LOVES, "2026-10-28T13:00:00.000Z"),
        scan(2, LOVES, "2026-10-26T12:00:00.000Z"),
        scan(3, LOVES, "2026-10-15T12:00:00.000Z"),
        // Outside the 30 days (which reach back to September 28), inside "all time".
        scan(4, LOVES, "2026-09-15T12:00:00.000Z"),
      ]),
      (candidate) => `https://fleetgridus.com/q/${candidate.slug}`,
      () => NOW,
    );
  });

  it("is for admins only", async () => {
    const error = await service.getOverview(USER_ID, {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("FORBIDDEN");
  });

  it("counts the tiles in Houston time", async () => {
    const { tiles } = await service.getOverview(ADMIN_ID, {});
    expect(tiles).toEqual({ today: 1, thisWeek: 2, thisMonth: 3, completePercent: 75, smsPercent: 75 });
  });

  it("lists the sources for the period, sorted by sign-ups, with visits for the codes only", async () => {
    const thirty = await service.getOverview(ADMIN_ID, {});
    expect(thirty.period).toBe("30");
    expect(thirty.sources).toEqual([
      { kind: "qr", qrLinkId: LOVES, label: "QR: Love's, Hwy 225", visits: 3, signups: 2, completed: 1, conversionPercent: 67 },
      { kind: "campaign", label: "Campaign: fb-october", visits: null, signups: 1, completed: 1, conversionPercent: null },
      { kind: "heard_from", label: "Said: Google search", visits: null, signups: 1, completed: 1, conversionPercent: null },
      { kind: "direct", label: "Direct or unknown", visits: null, signups: 0, completed: 0, conversionPercent: null },
      { kind: "qr", qrLinkId: PILOT, label: "QR: Pilot, Baytown", visits: 0, signups: 0, completed: 0, conversionPercent: null },
    ]);

    const week = await service.getOverview(ADMIN_ID, { period: "7" });
    expect(week.sources[0]).toMatchObject({ label: "QR: Love's, Hwy 225", visits: 2, signups: 2 });
    expect(week.sources.find((row) => row.kind === "campaign")).toBeUndefined();

    const all = await service.getOverview(ADMIN_ID, { period: "all" });
    expect(all.sources.find((row) => row.kind === "direct")).toMatchObject({ signups: 1, completed: 1 });
    expect(all.sources.find((row) => row.label === "Said: Flyer at a truck stop or shop")).toMatchObject({ signups: 1 });
    expect(all.sources[0]).toMatchObject({ label: "QR: Love's, Hwy 225", visits: 4 });
  });

  it("lists every code with its scans, sign-ups and conversion, newest first", async () => {
    const { qrLinks } = await service.getOverview(ADMIN_ID, {});
    expect(qrLinks.map((row) => row.link.slug)).toEqual(["pilot-baytown", "loves-hwy-225"]);
    expect(qrLinks[1]).toMatchObject({
      shortLink: "https://fleetgridus.com/q/loves-hwy-225",
      scans7d: 2,
      scansAll: 4,
      signups: 2,
      conversionPercent: 50,
    });
    expect(qrLinks[0]).toMatchObject({ scans7d: 0, scansAll: 0, signups: 0, conversionPercent: null });

    const one = await service.getQrLinkRow(ADMIN_ID, qrLinks[1].link);
    expect(one).toEqual(qrLinks[1]);
  });
});
