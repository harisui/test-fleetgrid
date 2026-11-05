import { SUBSCRIPTION_PRICE_DOLLARS } from "@/lib/constants";
import { isInsideAnyArea, milesBetween } from "@/lib/geo";
import { displayStatus } from "@/lib/shifts/schedule";
import { driverIdSchema, resumeDriverSchema } from "@/lib/validation/admin.schema";
import {
  adminCarriersQuerySchema,
  adminShiftsQuerySchema,
  areaActiveSchema,
  areaPreviewSchema,
  carrierIdSchema,
  removeAccountSchema,
  serviceAreaSchema,
  updateAreaSchema,
  type AdminCarriersQuery,
  type AdminShiftsQuery,
} from "@/lib/validation/admin-ops.schema";
import { shiftIdSchema } from "@/lib/validation/shift.schema";
import { ZIP_UNKNOWN_MESSAGE } from "@/lib/validation/onboarding.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IZipProvider } from "@/server/providers/ZipProvider";
import type { IAccountRepository } from "@/server/repositories/AccountRepository";
import type { IAdminOpsRepository, CarrierReviewRow, ShiftAdminRow } from "@/server/repositories/AdminOpsRepository";
import type { IAdminRepository } from "@/server/repositories/AdminRepository";
import type { IDocumentRepository } from "@/server/repositories/DocumentRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import { isAccessStatus } from "@/server/repositories/SubscriptionRepository";
import type {
  AccountStatus,
  AdminAction,
  AuditEntry,
  BroadcastRecipient,
  Profile,
  ServiceArea,
  Shift,
  SmsMessage,
  Subscription,
} from "@/types/domain";

export interface AdminCarrierRow extends CarrierReviewRow {
  /** The subscription that grants access, or the latest one. */
  subscription: Subscription | null;
  subscribed: boolean;
  inServiceArea: boolean;
}

export interface AdminCarriersPage {
  tiles: { total: number; subscribed: number; unpaid: number; blocked: number };
  rows: AdminCarrierRow[];
  query: AdminCarriersQuery;
}

export interface AdminCarrierDetail extends AdminCarrierRow {
  shifts: Shift[];
  history: AuditEntry[];
}

export interface AdminSubscriptionsPage {
  active: number;
  /** Monthly recurring revenue in dollars: the access-granting subscriptions times the price. */
  mrr: number;
  rows: { subscription: Subscription; companyName: string; carrierId: string }[];
}

export interface AdminShiftRow extends ShiftAdminRow {
  status: Shift["status"];
}

export interface AdminShiftsPage {
  tiles: { total: number; open: number; booked: number; fillRate: number | null };
  rows: AdminShiftRow[];
  query: AdminShiftsQuery;
}

export interface AdminShiftDetail extends AdminShiftRow {
  recipients: BroadcastRecipient[];
  texts: SmsMessage[];
}

export interface AreaRow {
  area: ServiceArea;
  drivers: number;
  carriers: number;
}

export interface AreaPreview {
  city: string;
  state: string;
  lat: number;
  lng: number;
  drivers: number;
  carriers: number;
}

export interface OpsTiles {
  carriers: number;
  subscribed: number;
  mrr: number;
  shifts30d: number;
  booked30d: number;
  fillRate30d: number | null;
}

const STATUS_ACTION: Record<AccountStatus, AdminAction> = {
  approved: "carrier_approved",
  blocked: "carrier_blocked",
  pending: "carrier_reopened",
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * The rest of the admin panel (T3.11): carriers (approve, block, reopen, remove), the
 * subscriptions with the active count and MRR, every shift with its recipients and texts,
 * the service areas (add, edit, activate, deactivate, with the head count before saving),
 * and a driver's pause and removal. Every change is in the audit log.
 */
export class AdminOpsService {
  constructor(
    private readonly ops: IAdminOpsRepository,
    private readonly admin: Pick<IAdminRepository, "writeAudit" | "listAudit" | "setProfileStatus" | "findDriver">,
    private readonly profiles: IProfileRepository,
    private readonly documents: IDocumentRepository,
    private readonly zips: IZipProvider,
    private readonly accounts: () => IAccountRepository,
    private readonly cancelSubscription: (userId: string) => Promise<void>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---------------------------------------------------------------------------
  // Carriers
  // ---------------------------------------------------------------------------
  async getCarriersPage(adminId: string, input: unknown): Promise<AdminCarriersPage> {
    await this.requireAdmin(adminId);
    const query = parseInput(adminCarriersQuerySchema, input);
    const [rows, areas] = await Promise.all([this.ops.listCarriers(), this.ops.listAreas()]);
    const all = rows.map((row) => this.carrierRow(row, areas));
    const filtered = all.filter((row) => {
      if (query.status === "subscribed") return row.subscribed;
      if (query.status === "unpaid") return !row.subscribed && row.profile.status !== "blocked";
      if (query.status === "blocked") return row.profile.status === "blocked";
      return true;
    });
    return {
      tiles: {
        total: all.length,
        subscribed: all.filter((row) => row.subscribed).length,
        unpaid: all.filter((row) => !row.subscribed && row.profile.status !== "blocked").length,
        blocked: all.filter((row) => row.profile.status === "blocked").length,
      },
      rows: filtered,
      query,
    };
  }

  async getCarrier(adminId: string, input: unknown): Promise<AdminCarrierDetail> {
    await this.requireAdmin(adminId);
    const { carrierId } = parseInput(carrierIdSchema, input);
    const [row, areas, shifts, history] = await Promise.all([
      this.ops.findCarrier(carrierId),
      this.ops.listAreas(),
      this.ops.listShifts(),
      this.admin.listAudit("carrier", carrierId),
    ]);
    if (!row) throw AppError.notFound("Carrier not found");
    return {
      ...this.carrierRow(row, areas),
      shifts: shifts.filter((item) => item.shift.carrierId === carrierId).map((item) => item.shift),
      history,
    };
  }

  approveCarrier(adminId: string, input: unknown): Promise<Profile> {
    return this.setCarrierStatus(adminId, input, "approved");
  }

  blockCarrier(adminId: string, input: unknown): Promise<Profile> {
    return this.setCarrierStatus(adminId, input, "blocked");
  }

  reopenCarrier(adminId: string, input: unknown): Promise<Profile> {
    return this.setCarrierStatus(adminId, input, "pending");
  }

  // ---------------------------------------------------------------------------
  // Removal and the driver's pause
  // ---------------------------------------------------------------------------
  /**
   * Deletes a driver's or carrier's account for good: a carrier's billing is cancelled first,
   * a driver's files are removed, then the auth user (the rows cascade). Admin accounts are
   * not removed here. The audit entry outlives the account.
   */
  async removeAccount(adminId: string, input: unknown): Promise<void> {
    const admin = await this.requireAdmin(adminId);
    const { profileId } = parseInput(removeAccountSchema, input);
    const profile = await this.profiles.findById(profileId);
    if (!profile || profile.role === "admin") throw AppError.notFound("Account not found");

    let targetId = profileId;
    let name: string | null = null;
    if (profile.role === "carrier") {
      const carrier = (await this.ops.listCarriers()).find((row) => row.profile.id === profileId);
      targetId = carrier?.carrier.id ?? profileId;
      name = carrier?.carrier.companyName ?? null;
      await this.cancelSubscription(profileId);
    } else {
      const driver = await this.ops.findDriverByProfile(profileId);
      if (driver) {
        targetId = driver.id;
        name = driver.fullName;
        for (const document of await this.documents.listByDriverId(driver.id)) {
          await this.documents.removeFile(document.storagePath);
        }
      }
    }
    await this.admin.writeAudit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: profile.role === "carrier" ? "carrier_removed" : "driver_removed",
      targetType: profile.role === "carrier" ? "carrier" : "driver",
      targetId,
      detail: { name, phone: profile.phone },
    });
    await this.accounts().deleteUser(profileId);
  }

  /** Stops shift texts to a driver (the no-show rule of 2026-10-25), or starts them again. */
  async setDriverPaused(adminId: string, input: unknown, paused: boolean): Promise<void> {
    const admin = await this.requireAdmin(adminId);
    const { driverId, reason } = paused
      ? { ...parseInput(driverIdSchema, input), reason: undefined }
      : parseInput(resumeDriverSchema, input);
    const row = await this.admin.findDriver(driverId);
    if (!row) throw AppError.notFound("Driver not found");
    if (row.driver.shiftsPaused === paused) return;
    await this.ops.setShiftsPaused(driverId, paused);
    await this.admin.writeAudit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: paused ? "driver_paused" : "driver_unpaused",
      targetType: "driver",
      targetId: driverId,
      detail: {
        name: row.driver.fullName,
        noShows: row.driver.noShowCount,
        ...(reason ? { reason, pausedFor: row.driver.shiftsPausedReason } : {}),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------
  async getSubscriptions(adminId: string): Promise<AdminSubscriptionsPage> {
    await this.requireAdmin(adminId);
    const carriers = await this.ops.listCarriers();
    const rows = carriers
      .flatMap((row) =>
        row.subscriptions.map((subscription) => ({
          subscription,
          companyName: row.carrier.companyName,
          carrierId: row.carrier.id,
        })),
      )
      .sort((a, b) => b.subscription.createdAt.localeCompare(a.subscription.createdAt));
    const active = carriers.filter((row) => row.subscriptions.some((s) => isAccessStatus(s.status))).length;
    return { active, mrr: active * SUBSCRIPTION_PRICE_DOLLARS, rows };
  }

  // ---------------------------------------------------------------------------
  // Shifts
  // ---------------------------------------------------------------------------
  async getShiftsPage(adminId: string, input: unknown): Promise<AdminShiftsPage> {
    await this.requireAdmin(adminId);
    const query = parseInput(adminShiftsQuerySchema, input);
    const all = (await this.ops.listShifts()).map((row) => this.shiftRow(row));
    const decided = all.filter((row) => row.status === "booked" || row.status === "expired").length;
    const booked = all.filter((row) => row.status === "booked").length;
    return {
      tiles: {
        total: all.length,
        open: all.filter((row) => row.status === "open").length,
        booked,
        fillRate: decided === 0 ? null : Math.round((booked / decided) * 100),
      },
      rows: query.status ? all.filter((row) => row.status === query.status) : all,
      query,
    };
  }

  async getShift(adminId: string, input: unknown): Promise<AdminShiftDetail> {
    await this.requireAdmin(adminId);
    const { shiftId } = parseInput(shiftIdSchema, input);
    const row = await this.ops.findShift(shiftId);
    if (!row) throw AppError.notFound("Shift not found");
    const [recipients, texts] = await Promise.all([this.ops.listRecipients(shiftId), this.ops.listSms(shiftId)]);
    return { ...this.shiftRow(row), recipients, texts };
  }

  // ---------------------------------------------------------------------------
  // Service areas
  // ---------------------------------------------------------------------------
  async getAreas(adminId: string): Promise<AreaRow[]> {
    await this.requireAdmin(adminId);
    const [areas, drivers, carriers] = await Promise.all([
      this.ops.listAreas(),
      this.ops.driverPlaces(),
      this.ops.carrierPlaces(),
    ]);
    return areas.map((area) => ({
      area,
      drivers: countInside(drivers, area.centerLat, area.centerLng, area.radiusMiles),
      carriers: countInside(carriers, area.centerLat, area.centerLng, area.radiusMiles),
    }));
  }

  /** "X drivers and Y carriers inside this area", before the admin saves. */
  async previewArea(adminId: string, input: unknown): Promise<AreaPreview> {
    await this.requireAdmin(adminId);
    const { centerZip, radiusMiles } = parseInput(areaPreviewSchema, input);
    const place = this.placeFor(centerZip);
    const [drivers, carriers] = await Promise.all([this.ops.driverPlaces(), this.ops.carrierPlaces()]);
    return {
      ...place,
      drivers: countInside(drivers, place.lat, place.lng, radiusMiles),
      carriers: countInside(carriers, place.lat, place.lng, radiusMiles),
    };
  }

  async createArea(adminId: string, input: unknown): Promise<ServiceArea> {
    const admin = await this.requireAdmin(adminId);
    const values = parseInput(serviceAreaSchema, input);
    const place = this.placeFor(values.centerZip);
    const area = await this.ops.createArea({
      name: values.name,
      centerZip: values.centerZip,
      centerLat: place.lat,
      centerLng: place.lng,
      radiusMiles: values.radiusMiles,
      isActive: true,
    });
    await this.audit(admin, "service_area_created", area, { radiusMiles: area.radiusMiles, centerZip: area.centerZip });
    return area;
  }

  async updateArea(adminId: string, input: unknown): Promise<ServiceArea> {
    const admin = await this.requireAdmin(adminId);
    const { areaId, ...values } = parseInput(updateAreaSchema, input);
    const before = (await this.ops.listAreas()).find((area) => area.id === areaId);
    if (!before) throw AppError.notFound("Area not found");
    const place = this.placeFor(values.centerZip);
    const area = await this.ops.updateArea(areaId, {
      name: values.name,
      centerZip: values.centerZip,
      centerLat: place.lat,
      centerLng: place.lng,
      radiusMiles: values.radiusMiles,
    });
    await this.audit(admin, "service_area_updated", area, {
      from: { name: before.name, centerZip: before.centerZip, radiusMiles: before.radiusMiles },
      to: { name: area.name, centerZip: area.centerZip, radiusMiles: area.radiusMiles },
    });
    return area;
  }

  async setAreaActive(adminId: string, input: unknown): Promise<ServiceArea> {
    const admin = await this.requireAdmin(adminId);
    const { areaId, isActive } = parseInput(areaActiveSchema, input);
    const area = await this.ops.updateArea(areaId, { isActive });
    await this.audit(admin, isActive ? "service_area_activated" : "service_area_deactivated", area, {});
    return area;
  }

  async getAreaHistory(adminId: string, areaId: string): Promise<AuditEntry[]> {
    await this.requireAdmin(adminId);
    return this.admin.listAudit("service_area", areaId);
  }

  // ---------------------------------------------------------------------------
  // Analytics: the carrier, subscription and shift tiles
  // ---------------------------------------------------------------------------
  async getOpsTiles(adminId: string): Promise<OpsTiles> {
    await this.requireAdmin(adminId);
    const [carriers, shifts] = await Promise.all([this.ops.listCarriers(), this.ops.listShifts()]);
    const subscribed = carriers.filter((row) => row.subscriptions.some((s) => isAccessStatus(s.status))).length;
    const since = this.now().getTime() - 30 * DAY;
    const recent = shifts.map((row) => this.shiftRow(row)).filter((row) => new Date(row.shift.createdAt).getTime() >= since);
    const booked = recent.filter((row) => row.status === "booked").length;
    const decided = recent.filter((row) => row.status === "booked" || row.status === "expired").length;
    return {
      carriers: carriers.length,
      subscribed,
      mrr: subscribed * SUBSCRIPTION_PRICE_DOLLARS,
      shifts30d: recent.length,
      booked30d: booked,
      fillRate30d: decided === 0 ? null : Math.round((booked / decided) * 100),
    };
  }

  // ---------------------------------------------------------------------------
  private carrierRow(row: CarrierReviewRow, areas: ServiceArea[]): AdminCarrierRow {
    const access = row.subscriptions.find((s) => isAccessStatus(s.status)) ?? null;
    return {
      ...row,
      subscription: access ?? row.subscriptions[0] ?? null,
      subscribed: access !== null,
      inServiceArea: isInsideAnyArea(row.carrier.lat, row.carrier.lng, areas),
    };
  }

  private shiftRow(row: ShiftAdminRow): AdminShiftRow {
    return { ...row, status: displayStatus(row.shift, this.now()) };
  }

  private async setCarrierStatus(adminId: string, input: unknown, status: AccountStatus): Promise<Profile> {
    const admin = await this.requireAdmin(adminId);
    const { carrierId } = parseInput(carrierIdSchema, input);
    const row = await this.ops.findCarrier(carrierId);
    if (!row) throw AppError.notFound("Carrier not found");
    const previous = row.profile.status;
    if (previous === status) return row.profile;
    const updated = await this.admin.setProfileStatus(row.profile.id, status);
    await this.admin.writeAudit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action: STATUS_ACTION[status],
      targetType: "carrier",
      targetId: carrierId,
      detail: { from: previous, to: status, name: row.carrier.companyName },
    });
    return updated;
  }

  private async audit(admin: Profile, action: AdminAction, area: ServiceArea, detail: Record<string, unknown>): Promise<void> {
    await this.admin.writeAudit({
      adminId: admin.id,
      adminPhone: admin.phone,
      action,
      targetType: "service_area",
      targetId: area.id,
      detail: { name: area.name, ...detail },
    });
  }

  private placeFor(zip: string): { city: string; state: string; lat: number; lng: number } {
    const place = this.zips.find(zip);
    if (!place) throw AppError.validation(undefined, { centerZip: ZIP_UNKNOWN_MESSAGE });
    return { city: place.city, state: place.state, lat: place.lat, lng: place.lng };
  }

  private async requireAdmin(adminId: string): Promise<Profile> {
    const profile = await this.profiles.findById(adminId);
    if (!profile || profile.role !== "admin" || profile.status === "blocked") {
      throw AppError.forbidden("Only admins can do this");
    }
    return profile;
  }
}

function countInside(places: { lat: number; lng: number }[], lat: number, lng: number, radiusMiles: number): number {
  return places.filter((place) => Math.round(milesBetween(lat, lng, place.lat, place.lng) * 1000) / 1000 <= radiusMiles).length;
}
