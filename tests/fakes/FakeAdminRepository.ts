import { AppError } from "@/server/errors/AppError";
import type {
  AuditEntryInput,
  DriverReviewRow,
  IAdminRepository,
} from "@/server/repositories/AdminRepository";
import type { AccountStatus, AuditEntry, AuditTargetType, Profile } from "@/types/domain";

/** In-memory stand-in for AdminRepository over a list of driver cards with their profiles. */
export class FakeAdminRepository implements IAdminRepository {
  readonly rows: DriverReviewRow[];
  readonly statusChanges: { profileId: string; status: AccountStatus }[] = [];
  readonly audit: AuditEntry[] = [];
  private sequence = 0;

  constructor(
    rows: DriverReviewRow[] = [],
    /** The profile store the service reads, kept in step like the one database would be. */
    private readonly profiles?: { rows: Map<string, Profile> },
  ) {
    this.rows = [...rows];
  }

  async listDrivers(): Promise<DriverReviewRow[]> {
    return [...this.rows].sort((a, b) => b.driver.createdAt.localeCompare(a.driver.createdAt));
  }

  async findDriver(driverId: string): Promise<DriverReviewRow | null> {
    return this.rows.find((row) => row.driver.id === driverId) ?? null;
  }

  async setProfileStatus(profileId: string, status: AccountStatus): Promise<Profile> {
    const row = this.rows.find((candidate) => candidate.profile.id === profileId);
    if (!row) throw AppError.notFound();
    this.statusChanges.push({ profileId, status });
    row.profile = { ...row.profile, status };
    this.profiles?.rows.set(profileId, row.profile);
    return row.profile;
  }

  async writeAudit(entry: AuditEntryInput): Promise<AuditEntry> {
    this.sequence += 1;
    const written: AuditEntry = {
      id: `a0000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      adminId: entry.adminId,
      adminPhone: entry.adminPhone,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      detail: entry.detail ?? {},
      createdAt: new Date(Date.UTC(2026, 9, 28, 12, 0, this.sequence)).toISOString(),
    };
    this.audit.push(written);
    return written;
  }

  async listAudit(targetType: AuditTargetType, targetId: string): Promise<AuditEntry[]> {
    return this.audit
      .filter((entry) => entry.targetType === targetType && entry.targetId === targetId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
