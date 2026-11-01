import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { BroadcastRecipient, RecipientStatus } from "@/types/domain";

type RecipientRow = Database["public"]["Tables"]["broadcast_recipients"]["Row"];
type RecipientUpdate = Database["public"]["Tables"]["broadcast_recipients"]["Update"];

export function mapRecipient(row: RecipientRow): BroadcastRecipient {
  return {
    id: row.id,
    shiftId: row.shift_id,
    driverId: row.driver_id,
    round: row.round,
    position: row.position,
    code: row.code,
    status: row.status,
    messageSid: row.message_sid,
    errorCode: row.error_code,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    repliedAt: row.replied_at,
    createdAt: row.created_at,
  };
}

export interface NewRecipient {
  shiftId: string;
  driverId: string;
  round: number;
  position: number;
  code: string;
}

export interface RecipientPatch {
  status?: RecipientStatus;
  messageSid?: string | null;
  errorCode?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
}

/** An offer a bare YES could mean: the shift is open and the code is its current one. */
export interface OpenOffer {
  shiftId: string;
  code: string;
}

export interface IBroadcastRepository {
  insertMany(rows: NewRecipient[]): Promise<BroadcastRecipient[]>;
  update(id: string, patch: RecipientPatch): Promise<void>;
  /** Applies a delivery update to the offer sent with this message id, if any. */
  updateByMessageSid(sid: string, patch: RecipientPatch): Promise<void>;
  listByShift(shiftId: string): Promise<BroadcastRecipient[]>;
  /** Drivers marked no-show on this shift, kept out of its next rounds. */
  noShowDriverIds(shiftId: string): Promise<string[]>;
  openOffersForDriver(driverId: string): Promise<OpenOffer[]>;
}

/** The offers of each broadcast round (0023). Written by the service role only. */
export class BroadcastRepository extends BaseRepository implements IBroadcastRepository {
  async insertMany(rows: NewRecipient[]): Promise<BroadcastRecipient[]> {
    if (rows.length === 0) return [];
    const result = await this.supabase
      .from("broadcast_recipients")
      .insert(
        rows.map((row) => ({
          shift_id: row.shiftId,
          driver_id: row.driverId,
          round: row.round,
          position: row.position,
          code: row.code,
        })),
      )
      .select("*");
    return this.unwrap(result).map(mapRecipient);
  }

  async update(id: string, patch: RecipientPatch): Promise<void> {
    const { error } = await this.supabase.from("broadcast_recipients").update(toUpdate(patch)).eq("id", id);
    if (error) throw this.toAppError(error);
  }

  async updateByMessageSid(sid: string, patch: RecipientPatch): Promise<void> {
    const { error } = await this.supabase
      .from("broadcast_recipients")
      .update(toUpdate(patch))
      .eq("message_sid", sid)
      // A booking or a no-show is never overwritten by a late delivery report.
      .in("status", ["queued", "sent", "delivered", "failed"]);
    if (error) throw this.toAppError(error);
  }

  async listByShift(shiftId: string): Promise<BroadcastRecipient[]> {
    const result = await this.supabase
      .from("broadcast_recipients")
      .select("*")
      .eq("shift_id", shiftId)
      .order("round", { ascending: false })
      .order("position", { ascending: true });
    return this.unwrap(result).map(mapRecipient);
  }

  async noShowDriverIds(shiftId: string): Promise<string[]> {
    const result = await this.supabase
      .from("broadcast_recipients")
      .select("driver_id")
      .eq("shift_id", shiftId)
      .eq("status", "no_show");
    return this.unwrap(result).map((row) => row.driver_id);
  }

  async openOffersForDriver(driverId: string): Promise<OpenOffer[]> {
    const result = await this.supabase
      .from("broadcast_recipients")
      .select("shift_id, code, status, shifts!inner(status, short_code, starts_at, ends_at, released_at)")
      .eq("driver_id", driverId)
      .in("status", ["queued", "sent", "delivered"])
      .eq("shifts.status", "open");
    const now = Date.now();
    const offers = this.unwrap(result).filter((row) => {
      const shift = row.shifts;
      if (shift.short_code !== row.code) return false;
      if (new Date(shift.starts_at).getTime() > now) return true;
      return shift.released_at !== null && new Date(shift.ends_at).getTime() > now;
    });
    const unique = new Map(offers.map((row) => [row.shift_id, { shiftId: row.shift_id, code: row.code }]));
    return [...unique.values()];
  }
}

function toUpdate(patch: RecipientPatch): RecipientUpdate {
  const update: RecipientUpdate = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.messageSid !== undefined) update.message_sid = patch.messageSid;
  if (patch.errorCode !== undefined) update.error_code = patch.errorCode;
  if (patch.sentAt !== undefined) update.sent_at = patch.sentAt;
  if (patch.deliveredAt !== undefined) update.delivered_at = patch.deliveredAt;
  return update;
}
