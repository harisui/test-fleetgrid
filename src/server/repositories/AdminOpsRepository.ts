import { mapCarrier } from "@/server/repositories/CarrierRepository";
import { BaseRepository } from "@/server/repositories/BaseRepository";
import { mapRecipient } from "@/server/repositories/BroadcastRepository";
import { mapProfile } from "@/server/repositories/ProfileRepository";
import { mapServiceArea } from "@/server/repositories/ServiceAreaRepository";
import { mapShift } from "@/server/repositories/ShiftRepository";
import { mapSmsMessage } from "@/server/repositories/SmsLogRepository";
import { mapSubscription } from "@/server/repositories/SubscriptionRepository";
import type {
  BroadcastRecipient,
  Carrier,
  Profile,
  ServiceArea,
  Shift,
  SmsMessage,
  Subscription,
} from "@/types/domain";

/** A carrier with the profile that owns it and every subscription, newest first. */
export interface CarrierReviewRow {
  carrier: Carrier;
  profile: Profile;
  subscriptions: Subscription[];
}

/** A shift with the company that posted it. */
export interface ShiftAdminRow {
  shift: Shift;
  companyName: string;
}

export interface ServiceAreaInput {
  name: string;
  centerZip: string;
  centerLat: number;
  centerLng: number;
  radiusMiles: number;
  isActive: boolean;
}

/** Where a driver or carrier sits, for "X drivers and Y carriers inside this area". */
export interface Located {
  lat: number;
  lng: number;
}

export interface IAdminOpsRepository {
  listCarriers(): Promise<CarrierReviewRow[]>;
  findCarrier(carrierId: string): Promise<CarrierReviewRow | null>;
  listShifts(limit?: number): Promise<ShiftAdminRow[]>;
  findShift(shiftId: string): Promise<ShiftAdminRow | null>;
  listRecipients(shiftId: string): Promise<BroadcastRecipient[]>;
  listSms(shiftId: string): Promise<SmsMessage[]>;
  listAreas(): Promise<ServiceArea[]>;
  createArea(input: ServiceAreaInput): Promise<ServiceArea>;
  updateArea(id: string, input: Partial<ServiceAreaInput>): Promise<ServiceArea>;
  driverPlaces(): Promise<Located[]>;
  carrierPlaces(): Promise<Located[]>;
  setShiftsPaused(driverId: string, paused: boolean): Promise<void>;
  findDriverByProfile(profileId: string): Promise<{ id: string; fullName: string } | null>;
}

const CARRIER_SELECT = "*, profiles!inner(*), subscriptions(*)";

/** The admin's reads and writes for Milestone 3. RLS lets admins through (0015, 0017, 0023, 0024). */
export class AdminOpsRepository extends BaseRepository implements IAdminOpsRepository {
  async listCarriers(): Promise<CarrierReviewRow[]> {
    const rows = this.unwrap(
      await this.supabase.from("carriers").select(CARRIER_SELECT).order("created_at", { ascending: false }),
    );
    return rows.map((row) => this.carrierRow(row));
  }

  async findCarrier(carrierId: string): Promise<CarrierReviewRow | null> {
    const rows = this.unwrap(await this.supabase.from("carriers").select(CARRIER_SELECT).eq("id", carrierId).limit(1));
    return rows[0] ? this.carrierRow(rows[0]) : null;
  }

  async listShifts(limit = 500): Promise<ShiftAdminRow[]> {
    const rows = this.unwrap(
      await this.supabase
        .from("shifts")
        .select("*, carriers!inner(company_name)")
        .order("starts_at", { ascending: false })
        .limit(limit),
    );
    return rows.map((row) => ({ shift: mapShift(row), companyName: row.carriers.company_name }));
  }

  async findShift(shiftId: string): Promise<ShiftAdminRow | null> {
    const rows = this.unwrap(
      await this.supabase.from("shifts").select("*, carriers!inner(company_name)").eq("id", shiftId).limit(1),
    );
    return rows[0] ? { shift: mapShift(rows[0]), companyName: rows[0].carriers.company_name } : null;
  }

  async listRecipients(shiftId: string): Promise<BroadcastRecipient[]> {
    const rows = this.unwrap(
      await this.supabase
        .from("broadcast_recipients")
        .select("*")
        .eq("shift_id", shiftId)
        .order("round", { ascending: false })
        .order("position", { ascending: true }),
    );
    return rows.map(mapRecipient);
  }

  async listSms(shiftId: string): Promise<SmsMessage[]> {
    const rows = this.unwrap(
      await this.supabase.from("sms_messages").select("*").eq("shift_id", shiftId).order("created_at", { ascending: true }),
    );
    return rows.map(mapSmsMessage);
  }

  async listAreas(): Promise<ServiceArea[]> {
    const rows = this.unwrap(await this.supabase.from("service_areas").select("*").order("name"));
    return rows.map(mapServiceArea);
  }

  async createArea(input: ServiceAreaInput): Promise<ServiceArea> {
    const result = await this.supabase
      .from("service_areas")
      .insert({
        name: input.name,
        center_zip: input.centerZip,
        center_lat: input.centerLat,
        center_lng: input.centerLng,
        radius_miles: input.radiusMiles,
        is_active: input.isActive,
      })
      .select("*")
      .single();
    return mapServiceArea(this.unwrap(result));
  }

  async updateArea(id: string, input: Partial<ServiceAreaInput>): Promise<ServiceArea> {
    const result = await this.supabase
      .from("service_areas")
      .update({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.centerZip !== undefined ? { center_zip: input.centerZip } : {}),
        ...(input.centerLat !== undefined ? { center_lat: input.centerLat } : {}),
        ...(input.centerLng !== undefined ? { center_lng: input.centerLng } : {}),
        ...(input.radiusMiles !== undefined ? { radius_miles: input.radiusMiles } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      })
      .eq("id", id)
      .select("*")
      .single();
    return mapServiceArea(this.unwrap(result));
  }

  async driverPlaces(): Promise<Located[]> {
    const rows = this.unwrap(
      await this.supabase.from("drivers").select("lat, lng").not("lat", "is", null).not("lng", "is", null),
    );
    return rows.map((row) => ({ lat: Number(row.lat), lng: Number(row.lng) }));
  }

  async carrierPlaces(): Promise<Located[]> {
    const rows = this.unwrap(await this.supabase.from("carriers").select("lat, lng"));
    return rows.map((row) => ({ lat: Number(row.lat), lng: Number(row.lng) }));
  }

  async setShiftsPaused(driverId: string, paused: boolean): Promise<void> {
    const { error } = await this.supabase.from("drivers").update({ shifts_paused: paused, shifts_paused_reason: null }).eq("id", driverId);
    if (error) throw this.toAppError(error);
  }

  async findDriverByProfile(profileId: string): Promise<{ id: string; fullName: string } | null> {
    const result = await this.supabase.from("drivers").select("id, full_name").eq("profile_id", profileId).limit(1);
    const row = this.unwrap(result)[0];
    return row ? { id: row.id, fullName: row.full_name } : null;
  }

  private carrierRow(row: Parameters<typeof mapCarrier>[0] & {
    profiles: Parameters<typeof mapProfile>[0];
    subscriptions: Parameters<typeof mapSubscription>[0][];
  }): CarrierReviewRow {
    return {
      carrier: mapCarrier(row),
      profile: mapProfile(row.profiles),
      subscriptions: row.subscriptions
        .map(mapSubscription)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }
}
