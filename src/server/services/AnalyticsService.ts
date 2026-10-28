import { startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { analyticsQuerySchema, type AnalyticsQuery, type Period } from "@/lib/validation/qr.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { DriverReviewRow, IAdminRepository } from "@/server/repositories/AdminRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { IQrLinkRepository, IQrScanRepository } from "@/server/repositories/QrLinkRepository";
import { HEARD_FROM_LABELS, type HeardFrom, type Profile, type QrLink, type QrScan } from "@/types/domain";

export interface SignupTiles {
  today: number;
  thisWeek: number;
  thisMonth: number;
  /** Of every driver, the share with a finished card, 0 to 100. Null with no drivers. */
  completePercent: number | null;
  /** Of every driver, the share who said yes to shift texts, 0 to 100. Null with no drivers. */
  smsPercent: number | null;
}

export type SourceKind = "qr" | "campaign" | "heard_from" | "direct";

/** One row of "Where drivers come from". */
export interface SourceRow {
  kind: SourceKind;
  /** The QR code's id, for a link to it. */
  qrLinkId?: string;
  label: string;
  /** Scans of the short link in the period. Null where visits cannot be counted. */
  visits: number | null;
  signups: number;
  completed: number;
  /** signups / visits, 0 to 100. Null without visits. */
  conversionPercent: number | null;
}

/** One QR code with its counts. */
export interface QrLinkRow {
  link: QrLink;
  shortLink: string;
  scans7d: number;
  scansAll: number;
  signups: number;
  conversionPercent: number | null;
}

export interface AnalyticsOverview {
  tiles: SignupTiles;
  period: Period;
  sources: SourceRow[];
  qrLinks: QrLinkRow[];
  query: AnalyticsQuery;
}

const percent = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

/**
 * The Analytics page (Milestone 3, part 3): sign-up counts, where drivers come from by
 * period, and every QR code with its scans and sign-ups. Everything is counted in memory
 * from one read of each table, which suits the launch size. Milestone 3 adds the carrier,
 * subscription and shift sections beside these.
 */
export class AnalyticsService {
  constructor(
    private readonly admin: IAdminRepository,
    private readonly profiles: IProfileRepository,
    private readonly links: IQrLinkRepository,
    private readonly scans: IQrScanRepository,
    private readonly shortLink: (link: Pick<QrLink, "slug">) => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getOverview(adminId: string, input: unknown): Promise<AnalyticsOverview> {
    await this.requireAdmin(adminId);
    const query = parseInput(analyticsQuerySchema, input);
    const [drivers, links, scans] = await Promise.all([
      this.admin.listDrivers(),
      this.links.list(),
      this.scans.listSince(),
    ]);
    const since = this.periodStart(query.period);
    const inPeriod = (iso: string) => since === null || Date.parse(iso) >= since.getTime();
    const periodDrivers = drivers.filter((row) => inPeriod(row.driver.createdAt));
    const periodScans = scans.filter((scan) => inPeriod(scan.scannedAt));
    return {
      tiles: this.tiles(drivers),
      period: query.period,
      sources: this.sources(periodDrivers, periodScans, links),
      qrLinks: this.qrRows(links, scans, drivers),
      query,
    };
  }

  /** One code with its counts, for the detail sheet. */
  async getQrLinkRow(adminId: string, link: QrLink): Promise<QrLinkRow> {
    await this.requireAdmin(adminId);
    const [drivers, scans] = await Promise.all([this.admin.listDrivers(), this.scans.listSince()]);
    return this.qrRows([link], scans, drivers)[0];
  }

  private periodStart(period: Period): Date | null {
    if (period === "all") return null;
    return subDays(this.now(), Number(period));
  }

  private tiles(drivers: DriverReviewRow[]): SignupTiles {
    const local = toZonedTime(this.now(), DEFAULT_TIMEZONE);
    const day = fromZonedTime(startOfDay(local), DEFAULT_TIMEZONE).getTime();
    const week = fromZonedTime(startOfWeek(local, { weekStartsOn: 1 }), DEFAULT_TIMEZONE).getTime();
    const month = fromZonedTime(startOfMonth(local), DEFAULT_TIMEZONE).getTime();
    const since = (from: number) => drivers.filter((row) => Date.parse(row.driver.createdAt) >= from).length;
    return {
      today: since(day),
      thisWeek: since(week),
      thisMonth: since(month),
      completePercent: percent(drivers.filter((row) => row.driver.cardCompleted).length, drivers.length),
      smsPercent: percent(drivers.filter((row) => row.driver.smsOptIn && !row.driver.smsOptedOut).length, drivers.length),
    };
  }

  /**
   * One row per QR code, per other UTM campaign, per "heard from" answer, and "Direct or
   * unknown". A sign-up counts under its QR code, else its campaign, else direct; the
   * "heard from" rows are what drivers said, so they overlap with the rest on purpose.
   */
  private sources(drivers: DriverReviewRow[], scans: QrScan[], links: QrLink[]): SourceRow[] {
    const rows: SourceRow[] = [];
    const byLink = new Map(links.map((link) => [link.id, link]));

    for (const link of links) {
      const mine = drivers.filter((row) => row.profile.source.qrLinkId === link.id);
      const visits = scans.filter((scan) => scan.qrLinkId === link.id).length;
      rows.push({
        kind: "qr",
        qrLinkId: link.id,
        label: `QR: ${link.locationName}`,
        visits,
        signups: mine.length,
        completed: mine.filter((row) => row.driver.cardCompleted).length,
        conversionPercent: percent(mine.length, visits),
      });
    }

    const campaigns = new Map<string, DriverReviewRow[]>();
    const direct: DriverReviewRow[] = [];
    for (const row of drivers) {
      const { source } = row.profile;
      if (source.qrLinkId && byLink.has(source.qrLinkId)) continue;
      if (source.utmCampaign) {
        campaigns.set(source.utmCampaign, [...(campaigns.get(source.utmCampaign) ?? []), row]);
      } else {
        direct.push(row);
      }
    }
    for (const [campaign, mine] of campaigns) {
      rows.push({
        kind: "campaign",
        label: `Campaign: ${campaign}`,
        visits: null,
        signups: mine.length,
        completed: mine.filter((row) => row.driver.cardCompleted).length,
        conversionPercent: null,
      });
    }

    const heard = new Map<HeardFrom, DriverReviewRow[]>();
    for (const row of drivers) {
      if (!row.driver.heardFrom) continue;
      heard.set(row.driver.heardFrom, [...(heard.get(row.driver.heardFrom) ?? []), row]);
    }
    for (const [answer, mine] of heard) {
      rows.push({
        kind: "heard_from",
        label: `Said: ${HEARD_FROM_LABELS[answer]}`,
        visits: null,
        signups: mine.length,
        completed: mine.filter((row) => row.driver.cardCompleted).length,
        conversionPercent: null,
      });
    }

    rows.push({
      kind: "direct",
      label: "Direct or unknown",
      visits: null,
      signups: direct.length,
      completed: direct.filter((row) => row.driver.cardCompleted).length,
      conversionPercent: null,
    });

    return rows.sort((a, b) => b.signups - a.signups || a.label.localeCompare(b.label));
  }

  private qrRows(links: QrLink[], scans: QrScan[], drivers: DriverReviewRow[]): QrLinkRow[] {
    const weekAgo = subDays(this.now(), 7).getTime();
    return links.map((link) => {
      const mine = scans.filter((scan) => scan.qrLinkId === link.id);
      const signups = drivers.filter((row) => row.profile.source.qrLinkId === link.id).length;
      return {
        link,
        shortLink: this.shortLink(link),
        scans7d: mine.filter((scan) => Date.parse(scan.scannedAt) >= weekAgo).length,
        scansAll: mine.length,
        signups,
        conversionPercent: percent(signups, mine.length),
      };
    });
  }

  private async requireAdmin(adminId: string): Promise<Profile> {
    const profile = await this.profiles.findById(adminId);
    if (!profile || profile.role !== "admin" || profile.status === "blocked") {
      throw AppError.forbidden("Only FleetGrid staff can do this");
    }
    return profile;
  }
}
