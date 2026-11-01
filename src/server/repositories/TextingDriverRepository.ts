import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { AccountStatus } from "@/types/domain";

/** A driver as the texting needs them: who they are, their number and whether texts may go. */
export interface TextingDriver {
  driverId: string;
  profileId: string;
  fullName: string;
  phone: string;
  status: AccountStatus;
  smsOptIn: boolean;
  smsOptedOut: boolean;
  shiftsPaused: boolean;
}

export interface ITextingDriverRepository {
  findByPhone(phone: string): Promise<TextingDriver | null>;
  findById(driverId: string): Promise<TextingDriver | null>;
  findByProfileId(profileId: string): Promise<TextingDriver | null>;
  /** STOP and START, synced from Twilio. */
  setOptedOut(driverId: string, optedOut: boolean, at: string): Promise<void>;
  setShiftsPaused(driverId: string, paused: boolean): Promise<void>;
}

const SELECT =
  "id, profile_id, full_name, sms_opt_in, sms_opted_out, shifts_paused, profiles!inner(phone, status, role)";

interface Row {
  id: string;
  profile_id: string;
  full_name: string;
  sms_opt_in: boolean;
  sms_opted_out: boolean;
  shifts_paused: boolean;
  profiles: { phone: string; status: AccountStatus; role: string };
}

function map(row: Row): TextingDriver {
  return {
    driverId: row.id,
    profileId: row.profile_id,
    fullName: row.full_name,
    phone: row.profiles.phone,
    status: row.profiles.status,
    smsOptIn: row.sms_opt_in,
    smsOptedOut: row.sms_opted_out,
    shiftsPaused: row.shifts_paused,
  };
}

/** Drivers by phone number and the state only the service role may change. */
export class TextingDriverRepository extends BaseRepository implements ITextingDriverRepository {
  async findByPhone(phone: string): Promise<TextingDriver | null> {
    const result = await this.supabase
      .from("drivers")
      .select(SELECT)
      .eq("profiles.phone", phone)
      .eq("profiles.role", "driver")
      .maybeSingle();
    const row = this.unwrapMaybe(result) as Row | null;
    return row ? map(row) : null;
  }

  async findById(driverId: string): Promise<TextingDriver | null> {
    const result = await this.supabase.from("drivers").select(SELECT).eq("id", driverId).maybeSingle();
    const row = this.unwrapMaybe(result) as Row | null;
    return row ? map(row) : null;
  }

  async findByProfileId(profileId: string): Promise<TextingDriver | null> {
    const result = await this.supabase.from("drivers").select(SELECT).eq("profile_id", profileId).maybeSingle();
    const row = this.unwrapMaybe(result) as Row | null;
    return row ? map(row) : null;
  }

  async setOptedOut(driverId: string, optedOut: boolean, at: string): Promise<void> {
    const { error } = await this.supabase
      .from("drivers")
      .update({ sms_opted_out: optedOut, sms_opted_out_at: optedOut ? at : null })
      .eq("id", driverId);
    if (error) throw this.toAppError(error);
  }

  async setShiftsPaused(driverId: string, paused: boolean): Promise<void> {
    const { error } = await this.supabase.from("drivers").update({ shifts_paused: paused }).eq("id", driverId);
    if (error) throw this.toAppError(error);
  }
}
