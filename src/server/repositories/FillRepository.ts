import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { ShiftFill } from "@/types/domain";

type FillRow = Database["public"]["Tables"]["shift_fills"]["Row"];

export interface IFillRepository {
  /** Service role: records every completed fill not yet recorded (0043) and returns the new ones. */
  recordCompleted(amountCents: number, included: number): Promise<ShiftFill[]>;
  /** Service role: billable fills with no invoice item yet, oldest first. */
  listUnbilled(carrierId?: string): Promise<ShiftFill[]>;
  /** Service role: stamps the Stripe invoice item on a fill. */
  markBilled(fillId: string, invoiceItemId: string, at: string): Promise<ShiftFill>;
  /** Service role: an admin waived the fill. */
  markWaived(fillId: string, adminId: string, reason: string, at: string): Promise<ShiftFill>;
  findById(fillId: string): Promise<ShiftFill | null>;
  /** The carrier's fills completed at or after `since` (RLS: their own, or an admin). */
  listForCarrier(carrierId: string, since: string | null): Promise<ShiftFill[]>;
  /** Every fill completed at or after `since`, newest first (RLS: admins only). */
  listSince(since: string): Promise<ShiftFill[]>;
}

export function mapFill(row: FillRow): ShiftFill {
  return {
    id: row.id,
    shiftId: row.shift_id,
    carrierId: row.carrier_id,
    driverId: row.driver_id,
    shiftStartsAt: row.shift_starts_at,
    shiftEndsAt: row.shift_ends_at,
    completedAt: row.completed_at,
    charge: row.charge,
    amountCents: row.amount_cents,
    stripeInvoiceItemId: row.stripe_invoice_item_id,
    billedAt: row.billed_at,
    waivedAt: row.waived_at,
    waivedBy: row.waived_by,
    waiveReason: row.waive_reason,
  };
}

/** Completed fills (0043). Carriers read their own, admins all; only the service role writes. */
export class FillRepository extends BaseRepository implements IFillRepository {
  async recordCompleted(amountCents: number, included: number): Promise<ShiftFill[]> {
    const result = await this.supabase.rpc("record_completed_fills", { p_amount_cents: amountCents, p_included: included });
    return (this.unwrapMaybe(result) ?? []).map(mapFill);
  }

  async listUnbilled(carrierId?: string): Promise<ShiftFill[]> {
    let query = this.supabase
      .from("shift_fills")
      .select("*")
      .eq("charge", "billable")
      .is("billed_at", null)
      .not("carrier_id", "is", null);
    if (carrierId) query = query.eq("carrier_id", carrierId);
    const result = await query.order("completed_at", { ascending: true }).order("id", { ascending: true });
    return (this.unwrapMaybe(result) ?? []).map(mapFill);
  }

  async markBilled(fillId: string, invoiceItemId: string, at: string): Promise<ShiftFill> {
    const result = await this.supabase
      .from("shift_fills")
      .update({ stripe_invoice_item_id: invoiceItemId, billed_at: at })
      .eq("id", fillId)
      .select("*")
      .single();
    return mapFill(this.unwrap(result));
  }

  async markWaived(fillId: string, adminId: string, reason: string, at: string): Promise<ShiftFill> {
    const result = await this.supabase
      .from("shift_fills")
      .update({ charge: "waived", amount_cents: 0, waived_at: at, waived_by: adminId, waive_reason: reason })
      .eq("id", fillId)
      .select("*")
      .single();
    return mapFill(this.unwrap(result));
  }

  async findById(fillId: string): Promise<ShiftFill | null> {
    const result = await this.supabase.from("shift_fills").select("*").eq("id", fillId).maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapFill(row) : null;
  }

  async listSince(since: string): Promise<ShiftFill[]> {
    const result = await this.supabase
      .from("shift_fills")
      .select("*")
      .gte("completed_at", since)
      .order("completed_at", { ascending: false });
    return (this.unwrapMaybe(result) ?? []).map(mapFill);
  }

  async listForCarrier(carrierId: string, since: string | null): Promise<ShiftFill[]> {
    let query = this.supabase.from("shift_fills").select("*").eq("carrier_id", carrierId);
    if (since) query = query.gte("completed_at", since);
    const result = await query.order("completed_at", { ascending: false });
    return (this.unwrapMaybe(result) ?? []).map(mapFill);
  }
}
