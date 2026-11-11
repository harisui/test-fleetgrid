import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { waiveFillSchema } from "@/lib/validation/admin-ops.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IAdminRepository } from "@/server/repositories/AdminRepository";
import type { ICarrierRepository } from "@/server/repositories/CarrierRepository";
import type { IFillRepository } from "@/server/repositories/FillRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { WaiveOutcome } from "@/server/services/FillService";
import type { Profile, ShiftFill } from "@/types/domain";

export interface AdminFillRow {
  fill: ShiftFill;
  companyName: string | null;
}

/** The completed fills of the month so far (Houston time), with what they bring in. */
export interface AdminFillsPage {
  since: string;
  /** Billable fills this month, in cents: the fill revenue shown next to MRR. */
  revenueCents: number;
  billable: number;
  included: number;
  waived: number;
  rows: AdminFillRow[];
}

/**
 * The admin's view of the per-fill billing (pricing of 2026-11-11): this month's completed
 * fills and their revenue, and the waive for a disputed fill, recorded in the audit log.
 */
export class AdminBillingService {
  constructor(
    private readonly profiles: IProfileRepository,
    private readonly fills: IFillRepository,
    private readonly carriers: Pick<ICarrierRepository, "findById">,
    private readonly admin: Pick<IAdminRepository, "writeAudit">,
    private readonly waive: (fillId: string, adminId: string, reason: string) => Promise<{ fill: ShiftFill; outcome: WaiveOutcome }>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getFills(adminId: string): Promise<AdminFillsPage> {
    await this.requireAdmin(adminId);
    const since = fromZonedTime(`${formatInTimeZone(this.now(), DEFAULT_TIMEZONE, "yyyy-MM")}-01T00:00:00`, DEFAULT_TIMEZONE).toISOString();
    const fills = await this.fills.listSince(since);
    const names = new Map<string, string | null>();
    for (const id of new Set(fills.map((fill) => fill.carrierId).filter((id): id is string => id !== null))) {
      names.set(id, (await this.carriers.findById(id))?.companyName ?? null);
    }
    const billable = fills.filter((fill) => fill.charge === "billable");
    return {
      since,
      revenueCents: billable.reduce((sum, fill) => sum + fill.amountCents, 0),
      billable: billable.length,
      included: fills.filter((fill) => fill.charge === "included").length,
      waived: fills.filter((fill) => fill.charge === "waived").length,
      rows: fills.map((fill) => ({ fill, companyName: fill.carrierId ? (names.get(fill.carrierId) ?? null) : null })),
    };
  }

  async waiveFill(adminId: string, input: unknown): Promise<{ fill: ShiftFill; outcome: WaiveOutcome }> {
    const admin = await this.requireAdmin(adminId);
    const { fillId, reason } = parseInput(waiveFillSchema, input);
    const before = await this.fills.findById(fillId);
    if (!before) throw AppError.notFound("Fill not found");
    const result = await this.waive(fillId, admin.id, reason);
    if (before.carrierId) {
      await this.admin.writeAudit({
        adminId: admin.id,
        adminPhone: admin.phone,
        action: "fill_waived",
        targetType: "carrier",
        targetId: before.carrierId,
        detail: { fillId, shiftId: before.shiftId, amountCents: before.amountCents, reason, outcome: result.outcome },
      });
    }
    return result;
  }

  private async requireAdmin(adminId: string): Promise<Profile> {
    const profile = await this.profiles.findById(adminId);
    if (!profile || profile.role !== "admin" || profile.status === "blocked") {
      throw AppError.forbidden("Only admins can do this");
    }
    return profile;
  }
}
