import { BaseRepository } from "@/server/repositories/BaseRepository";
import { mapDriver } from "@/server/repositories/DriverRepository";
import { mapProfile } from "@/server/repositories/ProfileRepository";
import type { AccountStatus, Driver, Profile } from "@/types/domain";

/** A driver's card with the profile that owns it, as the admin reviews them. */
export interface DriverReviewRow {
  driver: Driver;
  profile: Profile;
}

export interface IAdminRepository {
  /** Every driver card, newest first, or only those whose profile has the given status. */
  listDrivers(filter: { status?: AccountStatus }): Promise<DriverReviewRow[]>;
  /** Approves, blocks or reopens a profile. Only admins and the service role may (trigger). */
  setProfileStatus(profileId: string, status: AccountStatus): Promise<Profile>;
}

/** The admin's reads and writes across every driver. RLS lets admins through everywhere. */
export class AdminRepository extends BaseRepository implements IAdminRepository {
  async listDrivers(filter: { status?: AccountStatus }): Promise<DriverReviewRow[]> {
    let query = this.supabase
      .from("drivers")
      .select("*, profiles!inner(*)")
      .order("created_at", { ascending: false });
    if (filter.status) query = query.eq("profiles.status", filter.status);
    const rows = this.unwrap(await query);
    return rows.map(({ profiles, ...driver }) => ({
      driver: mapDriver(driver),
      profile: mapProfile(profiles),
    }));
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
}
