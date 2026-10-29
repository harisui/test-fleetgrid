import { BaseRepository } from "@/server/repositories/BaseRepository";
import { mapDriver } from "@/server/repositories/DriverRepository";
import { mapProfile } from "@/server/repositories/ProfileRepository";
import type { Database, Json } from "@/types/database.types";
import type {
  AccountStatus,
  AdminAction,
  AuditEntry,
  AuditTargetType,
  Driver,
  Profile,
} from "@/types/domain";

type AuditRow = Database["public"]["Tables"]["admin_audit_log"]["Row"];

/** A driver's card with the profile that owns it, as the admin reviews them. */
export interface DriverReviewRow {
  driver: Driver;
  profile: Profile;
}

export interface AuditEntryInput {
  adminId: string;
  adminPhone: string;
  action: AdminAction;
  targetType: AuditTargetType;
  targetId: string;
  detail?: Record<string, unknown>;
}

export interface IAdminRepository {
  /** Every driver card with its profile, newest first. The admin filters and pages in memory. */
  listDrivers(): Promise<DriverReviewRow[]>;
  findDriver(driverId: string): Promise<DriverReviewRow | null>;
  /** Approves, blocks or reopens a profile. Only admins and the service role may (trigger). */
  setProfileStatus(profileId: string, status: AccountStatus): Promise<Profile>;
  /** Records what the admin did. Admins write in their own name (RLS). */
  writeAudit(entry: AuditEntryInput): Promise<AuditEntry>;
  /** The history of one record, newest first. */
  listAudit(targetType: AuditTargetType, targetId: string): Promise<AuditEntry[]>;
}

function mapAudit(row: AuditRow): AuditEntry {
  const detail = row.detail;
  return {
    id: row.id,
    adminId: row.admin_id,
    adminPhone: row.admin_phone,
    action: row.action as AdminAction,
    targetType: row.target_type as AuditTargetType,
    targetId: row.target_id,
    detail:
      typeof detail === "object" && detail !== null && !Array.isArray(detail)
        ? (detail as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
  };
}

/** The admin's reads and writes across every driver. RLS lets admins through everywhere. */
export class AdminRepository extends BaseRepository implements IAdminRepository {
  async listDrivers(): Promise<DriverReviewRow[]> {
    const rows = this.unwrap(
      await this.supabase
        .from("drivers")
        .select("*, driver_clearinghouse_self_reports(confirmed_at), profiles!inner(*)")
        .order("created_at", { ascending: false }),
    );
    return rows.map((row) => ({ driver: mapDriver(row), profile: mapProfile(row.profiles) }));
  }

  async findDriver(driverId: string): Promise<DriverReviewRow | null> {
    const rows = this.unwrap(
      await this.supabase.from("drivers").select("*, driver_clearinghouse_self_reports(confirmed_at), profiles!inner(*)").eq("id", driverId).limit(1),
    );
    const row = rows[0];
    if (!row) return null;
    return { driver: mapDriver(row), profile: mapProfile(row.profiles) };
  }

  async setProfileStatus(profileId: string, status: AccountStatus): Promise<Profile> {
    const result = await this.supabase
      .from("profiles")
      .update({ status })
      .eq("id", profileId)
      .select("*")
      .single();
    return mapProfile(this.unwrap(result));
  }

  async writeAudit(entry: AuditEntryInput): Promise<AuditEntry> {
    const result = await this.supabase
      .from("admin_audit_log")
      .insert({
        admin_id: entry.adminId,
        admin_phone: entry.adminPhone,
        action: entry.action,
        target_type: entry.targetType,
        target_id: entry.targetId,
        detail: (entry.detail ?? {}) as NonNullable<Json>,
      })
      .select("*")
      .single();
    return mapAudit(this.unwrap(result));
  }

  async listAudit(targetType: AuditTargetType, targetId: string): Promise<AuditEntry[]> {
    const rows = this.unwrap(
      await this.supabase
        .from("admin_audit_log")
        .select("*")
        .eq("target_type", targetType)
        .eq("target_id", targetId)
        .order("created_at", { ascending: false }),
    );
    return rows.map(mapAudit);
  }
}
