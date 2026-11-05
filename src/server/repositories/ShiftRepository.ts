import { mapDocument } from "@/server/repositories/DocumentRepository";
import { AppError } from "@/server/errors/AppError";
import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import {
  CLAIM_OUTCOMES,
  type BookedDriverContact,
  type ClaimOutcome,
  type Shift,
  type ShiftRequirements,
  type ShiftStatus,
  type DriverDocument,
} from "@/types/domain";

type ShiftRow = Database["public"]["Tables"]["shifts"]["Row"];
type ShiftUpdate = Database["public"]["Tables"]["shifts"]["Update"];

export function mapShift(row: ShiftRow): Shift {
  return {
    id: row.id,
    carrierId: row.carrier_id,
    status: row.status,
    shortCode: row.short_code,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    zip: row.zip,
    city: row.city,
    state: row.state,
    lat: Number(row.lat),
    lng: Number(row.lng),
    cdlClass: row.cdl_class === "B" ? "B" : "A",
    endorsements: row.endorsements,
    minYears: row.min_years,
    equipmentTypes: row.equipment_types,
    twicRequired: row.twic_required,
    medicalRequired: row.medical_required,
    manualRequired: row.manual_required,
    payText: row.pay_text,
    workDescription: row.work_description,
    onsiteContactName: row.onsite_contact_name,
    onsiteContactPhone: row.onsite_contact_phone,
    sendAfter: row.send_after,
    broadcastRound: row.broadcast_round,
    broadcastAt: row.broadcast_at,
    releasedAt: row.released_at,
    bookedDriverId: row.booked_driver_id,
    bookedAt: row.booked_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A new shift as the carrier posts it. The code is drawn by the database. */
export interface CreateShiftInput extends ShiftRequirements {
  startsAt: string;
  endsAt: string;
  zip: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  payText: string | null;
  workDescription: string;
  onsiteContactName: string;
  onsiteContactPhone: string;
  sendAfter: string | null;
}

/** What the service role changes after posting. */
export interface ShiftPatch {
  status?: ShiftStatus;
  broadcastRound?: number;
  broadcastAt?: string | null;
  sendAfter?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

export interface ShiftListFilter {
  status?: ShiftStatus;
  carrierId?: string;
  limit?: number;
}

/** A matching driver with the number to text. */
export interface MatchedDriver {
  driverId: string;
  phone: string;
}

export interface IShiftRepository {
  create(carrierId: string, input: CreateShiftInput): Promise<Shift>;
  findById(id: string): Promise<Shift | null>;
  /** Newest start first. RLS decides what the caller sees. */
  list(filter?: ShiftListFilter): Promise<Shift[]>;
  listBookedByDriver(driverId: string): Promise<Shift[]>;
  update(id: string, patch: ShiftPatch): Promise<Shift>;
  claim(driverId: string, code: string): Promise<{ outcome: ClaimOutcome; shiftId: string | null }>;
  release(id: string): Promise<string | null>;
  expire(): Promise<number>;
  bookedDriverContact(id: string): Promise<BookedDriverContact | null>;
  /** The documents of a booked driver this carrier may open now (RLS, 0031). */
  bookedDriverDocuments(driverId: string): Promise<DriverDocument[]>;
  matchingDrivers(
    place: { lat: number; lng: number },
    requirements: ShiftRequirements,
    exclude?: string[],
  ): Promise<MatchedDriver[]>;
  /** Open shifts whose quiet-hours wait is over and whose first round has not gone out. */
  listDueBroadcasts(now: string): Promise<Shift[]>;
}

/**
 * Shifts (0023). Carriers insert and read their own through RLS; booking, cancelling,
 * releasing, expiring and matching need the service role.
 */
export class ShiftRepository extends BaseRepository implements IShiftRepository {
  async create(carrierId: string, input: CreateShiftInput): Promise<Shift> {
    const result = await this.supabase
      .from("shifts")
      .insert({
        carrier_id: carrierId,
        // The insert trigger draws a free code; the column is not null, so a blank goes in.
        short_code: "",
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        zip: input.zip,
        city: input.city,
        state: input.state,
        lat: input.lat,
        lng: input.lng,
        cdl_class: input.cdlClass,
        endorsements: input.endorsements,
        min_years: input.minYears,
        equipment_types: input.equipmentTypes,
        twic_required: input.twicRequired,
        medical_required: input.medicalRequired,
        manual_required: input.manualRequired,
        pay_text: input.payText,
        work_description: input.workDescription,
        onsite_contact_name: input.onsiteContactName,
        onsite_contact_phone: input.onsiteContactPhone,
        send_after: input.sendAfter,
      })
      .select("*")
      .single();
    return mapShift(this.unwrap(result));
  }

  async findById(id: string): Promise<Shift | null> {
    const result = await this.supabase.from("shifts").select("*").eq("id", id).maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapShift(row) : null;
  }

  async list(filter: ShiftListFilter = {}): Promise<Shift[]> {
    let query = this.supabase.from("shifts").select("*");
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.carrierId) query = query.eq("carrier_id", filter.carrierId);
    const result = await query.order("starts_at", { ascending: false }).limit(filter.limit ?? 200);
    return this.unwrap(result).map(mapShift);
  }

  async listBookedByDriver(driverId: string): Promise<Shift[]> {
    const result = await this.supabase
      .from("shifts")
      .select("*")
      .eq("booked_driver_id", driverId)
      .order("starts_at", { ascending: true });
    return this.unwrap(result).map(mapShift);
  }

  async update(id: string, patch: ShiftPatch): Promise<Shift> {
    const update: ShiftUpdate = {};
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.broadcastRound !== undefined) update.broadcast_round = patch.broadcastRound;
    if (patch.broadcastAt !== undefined) update.broadcast_at = patch.broadcastAt;
    if (patch.sendAfter !== undefined) update.send_after = patch.sendAfter;
    if (patch.cancelledAt !== undefined) update.cancelled_at = patch.cancelledAt;
    if (patch.cancelReason !== undefined) update.cancel_reason = patch.cancelReason;
    const result = await this.supabase.from("shifts").update(update).eq("id", id).select("*").single();
    return mapShift(this.unwrap(result));
  }

  async claim(driverId: string, code: string): Promise<{ outcome: ClaimOutcome; shiftId: string | null }> {
    const result = await this.supabase.rpc("claim_shift", { p_driver_id: driverId, p_code: code });
    const row = this.unwrap(result)[0];
    const outcome = CLAIM_OUTCOMES.find((value) => value === row?.outcome);
    if (!outcome) throw AppError.internal(new Error(`claim_shift answered ${String(row?.outcome)}`));
    return { outcome, shiftId: row.shift_id };
  }

  async release(id: string): Promise<string | null> {
    const result = await this.supabase.rpc("release_shift", { p_shift_id: id });
    return this.unwrapMaybe(result) ?? null;
  }

  async expire(): Promise<number> {
    const result = await this.supabase.rpc("expire_shifts");
    return this.unwrapMaybe(result) ?? 0;
  }

  async bookedDriverDocuments(driverId: string): Promise<DriverDocument[]> {
    const result = await this.supabase
      .from("driver_documents")
      .select("*")
      .eq("driver_id", driverId)
      .in("type", ["cdl_front", "cdl_back", "medical_card"])
      .order("created_at", { ascending: false });
    return this.unwrap(result).map(mapDocument);
  }

  async bookedDriverContact(id: string): Promise<BookedDriverContact | null> {
    const result = await this.supabase.rpc("booked_driver_contact", { p_shift_id: id });
    const row = this.unwrap(result)[0];
    return row ? { driverId: row.driver_id, fullName: row.full_name, phone: row.phone } : null;
  }

  async matchingDrivers(
    place: { lat: number; lng: number },
    requirements: ShiftRequirements,
    exclude: string[] = [],
  ): Promise<MatchedDriver[]> {
    const result = await this.supabase.rpc("matching_drivers", {
      p_lat: place.lat,
      p_lng: place.lng,
      p_cdl_class: requirements.cdlClass,
      p_endorsements: requirements.endorsements,
      p_min_years: requirements.minYears,
      p_equipment: requirements.equipmentTypes,
      p_twic: requirements.twicRequired,
      p_medical: requirements.medicalRequired,
      p_manual: requirements.manualRequired,
      p_exclude: exclude,
    });
    return this.unwrap(result).map((row) => ({ driverId: row.driver_id, phone: row.phone }));
  }

  async listDueBroadcasts(now: string): Promise<Shift[]> {
    const result = await this.supabase
      .from("shifts")
      .select("*")
      .eq("status", "open")
      .eq("broadcast_round", 0)
      .lte("send_after", now)
      .gt("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(50);
    return this.unwrap(result).map(mapShift);
  }
}
