import { startOfDay, startOfWeek } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { ADMIN_PAGE_SIZE, DEFAULT_TIMEZONE, SIGNED_URL_TTL_SECONDS } from "@/lib/constants";
import { isInsideAnyArea } from "@/lib/geo";
import { APPROVE_INCOMPLETE_REASON } from "@/lib/admin/options";
import { describeSource, type DriverSource } from "@/lib/admin/source";
import {
  adminDriversQuerySchema,
  driverIdSchema,
  type AdminDriversQuery,
} from "@/lib/validation/admin.schema";
import { documentIdSchema } from "@/lib/validation/document.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { DriverReviewRow, IAdminRepository } from "@/server/repositories/AdminRepository";
import type { IDocumentRepository } from "@/server/repositories/DocumentRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { IQrLinkRepository } from "@/server/repositories/QrLinkRepository";
import type { IServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import type {
  AccountStatus,
  AdminAction,
  AuditEntry,
  DriverDocument,
  Profile,
  QrLink,
  ServiceArea,
} from "@/types/domain";

/** A driver as the admin's list shows them: the card, the profile, the area, the source and whether the card is finished. */
export interface AdminDriverRow extends DriverReviewRow {
  /** Null for a card without coordinates (the ZIP screen not reached yet). */
  inServiceArea: boolean | null;
  complete: boolean;
  source: DriverSource;
}

export interface DriverTiles {
  total: number;
  pending: number;
  approved: number;
  blocked: number;
  incomplete: number;
  /** Sign-ups since midnight in the business time zone. */
  today: number;
  /** Sign-ups since Monday midnight in the business time zone. */
  thisWeek: number;
}

export interface AdminDriversPage {
  tiles: DriverTiles;
  rows: AdminDriverRow[];
  /** Rows matching the filters, across every page. */
  total: number;
  page: number;
  pageSize: number;
  query: AdminDriversQuery;
  /** The code the list is narrowed to (query.qr), when it exists. */
  qrLink: QrLink | null;
}

/** One driver with their papers and what the admin did to them. */
export interface AdminDriverDetail extends AdminDriverRow {
  documents: DriverDocument[];
  history: AuditEntry[];
}

const STATUS_ORDER: Record<AccountStatus, number> = { pending: 0, approved: 1, blocked: 2 };

const ACTION_FOR: Record<AccountStatus, AdminAction> = {
  approved: "driver_approved",
  blocked: "driver_blocked",
  pending: "driver_reopened",
};

/**
 * The admin's Drivers page (Milestone 3, part 2): the counts, the filtered and sorted list,
 * one driver's details with their papers and history, and the three status changes, each
 * written to the audit log. Approve lists a driver to subscribed carriers and needs a
 * finished card; block hides them and signs them out at their next request; pending puts
 * them back in the queue. The list is filtered in memory: every card is read once (the
 * admin's RLS), the area answer comes from the same haversine as the database, and the
 * source names the QR code a driver scanned (part 4).
 */
export class AdminService {
  constructor(
    private readonly admin: IAdminRepository,
    private readonly profiles: IProfileRepository,
    private readonly serviceAreas: IServiceAreaRepository,
    private readonly documents: IDocumentRepository,
    private readonly qrLinks: IQrLinkRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getDriversPage(adminId: string, input: unknown): Promise<AdminDriversPage> {
    await this.requireAdmin(adminId);
    const query = parseInput(adminDriversQuerySchema, input);
    const links = await this.qrLinks.list();
    const all = await this.locate(await this.admin.listDrivers(), links);
    const matching = sortRows(all.filter((row) => matches(row, query)), query);
    const pageCount = Math.max(1, Math.ceil(matching.length / ADMIN_PAGE_SIZE));
    const page = Math.min(query.page, pageCount);
    const start = (page - 1) * ADMIN_PAGE_SIZE;
    return {
      tiles: this.tiles(all),
      rows: matching.slice(start, start + ADMIN_PAGE_SIZE),
      total: matching.length,
      page,
      pageSize: ADMIN_PAGE_SIZE,
      query: { ...query, page },
      qrLink: (query.qr && links.find((link) => link.id === query.qr)) || null,
    };
  }

  async getDriver(adminId: string, input: unknown): Promise<AdminDriverDetail> {
    await this.requireAdmin(adminId);
    const { driverId } = parseInput(driverIdSchema, input);
    const row = await this.admin.findDriver(driverId);
    if (!row) throw AppError.notFound("Driver not found");
    const link = row.profile.source.qrLinkId ? await this.qrLinks.findById(row.profile.source.qrLinkId) : null;
    const [located] = await this.locate([row], link ? [link] : []);
    const [documents, history] = await Promise.all([
      this.documents.listByDriverId(driverId),
      this.admin.listAudit("driver", driverId),
    ]);
    return { ...located, documents, history };
  }

  /** Lists the driver to subscribed carriers. Refused while the card is not finished. */
  async approveDriver(adminId: string, input: unknown): Promise<Profile> {
    return this.changeStatus(adminId, input, "approved");
  }

  /** Hides the driver from carriers and signs them out at their next request. */
  async blockDriver(adminId: string, input: unknown): Promise<Profile> {
    return this.changeStatus(adminId, input, "blocked");
  }

  /** Back to the review queue. */
  async reopenDriver(adminId: string, input: unknown): Promise<Profile> {
    return this.changeStatus(adminId, input, "pending");
  }

  /** A link to one of a driver's files, for the detail sheet. Expires after SIGNED_URL_TTL_SECONDS. */
  async getDocumentUrl(adminId: string, input: unknown): Promise<string> {
    await this.requireAdmin(adminId);
    const { documentId } = parseInput(documentIdSchema, input);
    const document = await this.documents.findById(documentId);
    if (!document) throw AppError.notFound("Document not found");
    return this.documents.createSignedUrl(document.storagePath, SIGNED_URL_TTL_SECONDS);
  }

  private async changeStatus(adminId: string, input: unknown, status: AccountStatus): Promise<Profile> {
    const admin = await this.requireAdmin(adminId);
    const { driverId } = parseInput(driverIdSchema, input);
    const row = await this.admin.findDriver(driverId);
    if (!row || row.profile.role !== "driver") throw AppError.notFound("Driver not found");
    if (status === "approved" && !row.driver.cardCompleted) {
      throw AppError.validation(APPROVE_INCOMPLETE_REASON);
    }
    const previous = row.profile.status;
    if (previous === status) return row.profile;

    const updated = await this.admin.setProfileStatus(row.profile.id, status);
    await this.admin.writeAudit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: ACTION_FOR[status],
      targetType: "driver",
      targetId: driverId,
      detail: { from: previous, to: status, name: row.driver.fullName },
    });
    return updated;
  }

  /** The area answer and the source for each row; `links` are the codes the rows may name. */
  private async locate(rows: DriverReviewRow[], links: QrLink[]): Promise<AdminDriverRow[]> {
    const areas: ServiceArea[] = rows.some((row) => row.driver.lat !== null && row.driver.lng !== null)
      ? await this.serviceAreas.listActive()
      : [];
    const byId = new Map(links.map((link) => [link.id, link]));
    return rows.map((row) => ({
      ...row,
      inServiceArea:
        row.driver.lat === null || row.driver.lng === null
          ? null
          : isInsideAnyArea(row.driver.lat, row.driver.lng, areas),
      complete: row.driver.cardCompleted,
      source: describeSource(row.profile.source, byId.get(row.profile.source.qrLinkId ?? "") ?? null),
    }));
  }

  private tiles(rows: AdminDriverRow[]): DriverTiles {
    const local = toZonedTime(this.now(), DEFAULT_TIMEZONE);
    const today = fromZonedTime(startOfDay(local), DEFAULT_TIMEZONE).getTime();
    const week = fromZonedTime(startOfWeek(local, { weekStartsOn: 1 }), DEFAULT_TIMEZONE).getTime();
    const count = (test: (row: AdminDriverRow) => boolean) => rows.filter(test).length;
    return {
      total: rows.length,
      pending: count((row) => row.profile.status === "pending"),
      approved: count((row) => row.profile.status === "approved"),
      blocked: count((row) => row.profile.status === "blocked"),
      incomplete: count((row) => !row.complete),
      today: count((row) => Date.parse(row.driver.createdAt) >= today),
      thisWeek: count((row) => Date.parse(row.driver.createdAt) >= week),
    };
  }

  private async requireAdmin(adminId: string): Promise<Profile> {
    const profile = await this.profiles.findById(adminId);
    if (!profile || profile.role !== "admin" || profile.status === "blocked") {
      throw AppError.forbidden("Only FleetGrid staff can do this");
    }
    return profile;
  }
}

const digitsOf = (value: string) => value.replace(/\D/g, "");

/** The filters and the search, as the page applies them. */
export function matches(row: AdminDriverRow, query: AdminDriversQuery): boolean {
  if (query.status && row.profile.status !== query.status) return false;
  if (query.complete === "complete" && !row.complete) return false;
  if (query.complete === "incomplete" && row.complete) return false;
  if (query.area === "in" && row.inServiceArea !== true) return false;
  if (query.area === "out" && row.inServiceArea !== false) return false;
  if (query.source && row.source.kind !== query.source) return false;
  if (query.qr && row.source.qrLinkId !== query.qr) return false;
  if (query.selfReport === "yes" && row.driver.clearinghouseSelfReportedAt === null) return false;
  if (query.selfReport === "none" && row.driver.clearinghouseSelfReportedAt !== null) return false;
  if (query.q) {
    const text = query.q.toLowerCase();
    const digits = digitsOf(query.q);
    const nameHit = row.driver.fullName.toLowerCase().includes(text);
    const phoneHit = digits.length >= 3 && digitsOf(row.profile.phone).includes(digits);
    const zipHit = /^\d{1,5}$/.test(query.q) && (row.driver.zip ?? "").startsWith(query.q);
    if (!nameHit && !phoneHit && !zipHit) return false;
  }
  return true;
}

export function sortRows(rows: AdminDriverRow[], query: AdminDriversQuery): AdminDriverRow[] {
  const direction = query.dir === "asc" ? 1 : -1;
  const compare = (a: AdminDriverRow, b: AdminDriverRow): number => {
    switch (query.sort) {
      case "name":
        return a.driver.fullName.localeCompare(b.driver.fullName);
      case "status":
        return STATUS_ORDER[a.profile.status] - STATUS_ORDER[b.profile.status];
      default:
        return a.driver.createdAt.localeCompare(b.driver.createdAt);
    }
  };
  return [...rows].sort((a, b) => compare(a, b) * direction || b.driver.createdAt.localeCompare(a.driver.createdAt));
}
