import { needsTwicDate, twicIssue } from "@/lib/drivers/twic";
import { startOfDay, startOfWeek } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { ADMIN_PAGE_SIZE, DEFAULT_TIMEZONE, SIGNED_URL_TTL_SECONDS } from "@/lib/constants";
import {
  REQUIRED_DOCUMENTS,
  SHIFT_READY_ITEM_LABELS,
  inRosterGrace,
  missingDocuments,
  shiftReadyMissing,
  type ShiftReadyItem,
} from "@/lib/drivers/tiers";
import { isInsideAnyArea } from "@/lib/geo";
import { describeSource, type DriverSource } from "@/lib/admin/source";
import {
  adminDriversQuerySchema,
  driverIdSchema,
  markShiftReadySchema,
  OVERRIDE_REASON_MESSAGE,
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
  DocumentType,
} from "@/types/domain";
import { ROSTER_READY } from "@/lib/drivers/tiers";

/** A driver as the admin's list shows them: the card, the profile, the area, the source and whether the card is finished. */
export interface AdminDriverRow extends DriverReviewRow {
  /** Null for a card without coordinates (the ZIP screen not reached yet). */
  inServiceArea: boolean | null;
  complete: boolean;
  source: DriverSource;
  /** The required documents this driver has not uploaded (CR-5). */
  missingDocuments: DocumentType[];
  /** Inside the grace period: what the driver must add by rosterGraceUntil. Empty otherwise. */
  needsUpdate: ShiftReadyItem[];
}

export interface DriverTiles {
  total: number;
  pending: number;
  approved: number;
  blocked: number;
  incomplete: number;
  /** Registered drivers still missing a required document (CR-5). */
  missingDocuments: number;
  /** Missing-documents reminders sent in the last 7 days (CR-5). */
  remindersSent: number;
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

/** One of the three documents Shift-Ready needs, with a short-lived link to view it. */
export interface ShiftReadyPhoto {
  type: (typeof REQUIRED_DOCUMENTS)[number];
  document: DriverDocument | null;
  url: string | null;
}

/** One driver with their papers and what the admin did to them. */
export interface AdminDriverDetail extends AdminDriverRow {
  documents: DriverDocument[];
  history: AuditEntry[];
  /** What keeps the driver from Shift-Ready (CR-5); empty when nothing does. */
  missing: ShiftReadyItem[];
  /** The CDL front, the CDL back and the medical card, the latest of each, for the review. */
  photos: ShiftReadyPhoto[];
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
    /** Part 3b: texts a driver with shift texts on when they are approved. Never throws. */
    private readonly onDriverApproved: (driver: { driverId: string; smsOptIn: boolean }) => Promise<void> = async () =>
      undefined,
  ) {}

  async getDriversPage(adminId: string, input: unknown): Promise<AdminDriversPage> {
    await this.requireAdmin(adminId);
    const query = parseInput(adminDriversQuerySchema, input);
    const links = await this.qrLinks.list();
    const [drivers, held, remindersSent] = await Promise.all([
      this.admin.listDrivers(),
      this.admin.listRequiredDocuments(),
      this.admin.countDocRemindersSince(new Date(this.now().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);
    const all = await this.locate(drivers, links, held);
    const matching = sortRows(all.filter((row) => matches(row, query)), query);
    const pageCount = Math.max(1, Math.ceil(matching.length / ADMIN_PAGE_SIZE));
    const page = Math.min(query.page, pageCount);
    const start = (page - 1) * ADMIN_PAGE_SIZE;
    return {
      tiles: this.tiles(all, remindersSent),
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
    const [documents, history] = await Promise.all([
      this.documents.listByDriverId(driverId),
      this.admin.listAudit("driver", driverId),
    ]);
    const [located] = await this.locate(
      [row],
      link ? [link] : [],
      documents.map((document) => ({ driverId, type: document.type })),
    );
    const photos = await Promise.all(
      REQUIRED_DOCUMENTS.map(async (type): Promise<ShiftReadyPhoto> => {
        const document =
          documents.filter((item) => item.type === type).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
        const url = document
          ? await this.documents.createSignedUrl(document.storagePath, SIGNED_URL_TTL_SECONDS).catch(() => null)
          : null;
        return { type, document, url };
      }),
    );
    const missing = shiftReadyMissing(row.driver, documents.map((document) => document.type));
    return { ...located, documents, history, missing, photos };
  }

  /**
   * Mark Shift-Ready (CR-5): only when the CDL front, the CDL back and the medical card are in,
   * the name has two words and the card is complete. A CDL from another state needs a typed
   * reason, kept on the card and in the audit log. The database checks the same rule again.
   */
  async approveDriver(adminId: string, input: unknown): Promise<Profile> {
    const admin = await this.requireAdmin(adminId);
    const { driverId, overrideReason } = parseInput(markShiftReadySchema, input);
    const row = await this.admin.findDriver(driverId);
    if (!row || row.profile.role !== "driver") throw AppError.notFound("Driver not found");
    if (row.profile.status === "approved") return row.profile;
    const previous = row.profile.status;

    const documents = await this.documents.listByDriverId(driverId);
    const needsOverride = row.driver.cdlState !== "TX";
    const missing = shiftReadyMissing(
      { ...row.driver, shiftReadyOverrideReason: needsOverride ? (overrideReason ?? null) : null },
      documents.map((document) => document.type),
    );
    if (needsOverride && !overrideReason) {
      throw AppError.validation(undefined, { overrideReason: OVERRIDE_REASON_MESSAGE });
    }
    if (missing.length > 0) {
      throw AppError.validation(
        `Not ${ROSTER_READY} yet: ${missing.map((item) => SHIFT_READY_ITEM_LABELS[item]).join(", ")}.`,
      );
    }
    await this.admin.setShiftReadyOverride(driverId, needsOverride ? (overrideReason as string) : null);
    let updated: Profile;
    try {
      updated = await this.admin.setProfileStatus(row.profile.id, "approved");
    } catch (error) {
      // The database's own check (0028) disagrees: the card changed a moment ago.
      if (error instanceof AppError && error.code === "VALIDATION") {
        throw AppError.validation("The driver's documents or card changed. Reload and check again.");
      }
      throw error;
    }
    await this.admin.writeAudit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: "driver_approved",
      targetType: "driver",
      targetId: driverId,
      detail: {
        from: previous,
        to: "approved",
        name: row.driver.fullName,
        ...(needsOverride ? { cdlState: row.driver.cdlState, overrideReason } : {}),
      },
    });
    await this.onDriverApproved({ driverId, smsOptIn: row.driver.smsOptIn }).catch(() => undefined);
    return updated;
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

  private async changeStatus(adminId: string, input: unknown, status: Exclude<AccountStatus, "approved">): Promise<Profile> {
    const admin = await this.requireAdmin(adminId);
    const { driverId } = parseInput(driverIdSchema, input);
    const row = await this.admin.findDriver(driverId);
    if (!row || row.profile.role !== "driver") throw AppError.notFound("Driver not found");
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
  private async locate(
    rows: DriverReviewRow[],
    links: QrLink[],
    held: readonly { driverId: string; type: DocumentType }[],
  ): Promise<AdminDriverRow[]> {
    const heldBy = new Map<string, DocumentType[]>();
    for (const { driverId, type } of held) heldBy.set(driverId, [...(heldBy.get(driverId) ?? []), type]);
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
      missingDocuments: missingDocuments(heldBy.get(row.driver.id) ?? []),
      needsUpdate: inRosterGrace(row.driver, this.now()) ? shiftReadyMissing(row.driver, heldBy.get(row.driver.id) ?? []) : [],
      source: describeSource(row.profile.source, byId.get(row.profile.source.qrLinkId ?? "") ?? null),
    }));
  }

  private tiles(rows: AdminDriverRow[], remindersSent: number): DriverTiles {
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
      missingDocuments: count((row) => (row.profile.status === "pending" || row.needsUpdate.length > 0) && row.missingDocuments.length > 0),
      remindersSent,
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
  if (query.cdl === "tx" && row.driver.cdlState !== "TX") return false;
  if (query.cdl === "other" && (row.driver.cdlState === null || row.driver.cdlState === "TX")) return false;
  if (query.cdl === "none" && row.driver.cdlState !== null) return false;
  if (query.docs) {
    if (query.docs === "update" && row.needsUpdate.length === 0) return false;
    const lacks = row.profile.status === "pending" || row.needsUpdate.length > 0 ? row.missingDocuments : [];
    if (query.docs === "any" && lacks.length === 0) return false;
    if (query.docs === "cdl" && !lacks.includes("cdl_front") && !lacks.includes("cdl_back")) return false;
    if (query.docs === "medical" && !lacks.includes("medical_card")) return false;
  }
  if (query.rereview === "yes" && !row.driver.rereviewNeeded) return false;
  if (query.twic) {
    const issue = twicIssue(row.driver);
    if (query.twic === "issue" && !issue) return false;
    if (query.twic === "review" && issue !== "needs_review") return false;
    if (query.twic === "nodate" && !needsTwicDate(row.driver)) return false;
  }
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
