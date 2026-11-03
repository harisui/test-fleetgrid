import { BaseRepository } from "@/server/repositories/BaseRepository";
import { mapRecipient } from "@/server/repositories/BroadcastRepository";
import { mapShift } from "@/server/repositories/ShiftRepository";
import { mapSmsMessage } from "@/server/repositories/SmsLogRepository";
import type { Database } from "@/types/database.types";
import type { BroadcastRecipient, NoticeBatch, Shift, SmsMessage } from "@/types/domain";

type BatchRow = Database["public"]["Tables"]["notice_batches"]["Row"];

export function mapNoticeBatch(row: BatchRow): NoticeBatch {
  const variables =
    typeof row.variables === "object" && row.variables !== null && !Array.isArray(row.variables)
      ? (row.variables as Record<string, string>)
      : {};
  return {
    id: row.id,
    category: row.category,
    variables,
    body: row.body,
    areaId: row.area_id,
    createdBy: row.created_by,
    restoresBatchId: row.restores_batch_id,
    recipientCount: row.recipient_count,
    excludedOptedOut: row.excluded_opted_out,
    excludedNoConsent: row.excluded_no_consent,
    excludedBlocked: row.excluded_blocked,
    excludedRecent: row.excluded_recent,
    sendAfter: row.send_after,
    status: row.status,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  };
}

export interface MessageFilter {
  from: string;
  to: string;
  direction?: "inbound" | "outbound";
  kinds?: string[];
  driverId?: string;
  shiftId?: string;
  batchId?: string;
  inboundOutcomes?: string[];
  limit?: number;
}

export interface IMessagingRepository {
  listMessages(filter: MessageFilter): Promise<SmsMessage[]>;
  findMessage(id: string): Promise<SmsMessage | null>;
  hasResend(id: string): Promise<boolean>;
  /** Shifts whose first broadcast went out in the range, with the posting company. */
  listBroadcastShifts(from: string, to: string): Promise<{ shift: Shift; companyName: string }[]>;
  findShift(shiftId: string): Promise<{ shift: Shift; companyName: string } | null>;
  listRecipients(shiftIds: string[]): Promise<BroadcastRecipient[]>;
  countBookedShifts(from: string, to: string): Promise<number>;
  listBatches(from: string, to: string): Promise<NoticeBatch[]>;
  findBatch(id: string): Promise<NoticeBatch | null>;
  driverNames(ids: string[]): Promise<Map<string, string>>;
}

/** The admin's reads of the text log and its links (0023, 0026). RLS: admins only. */
export class MessagingRepository extends BaseRepository implements IMessagingRepository {
  async listMessages(filter: MessageFilter): Promise<SmsMessage[]> {
    let query = this.supabase
      .from("sms_messages")
      .select("*")
      .gte("created_at", filter.from)
      .lt("created_at", filter.to);
    if (filter.direction) query = query.eq("direction", filter.direction);
    if (filter.kinds?.length) query = query.in("kind", filter.kinds);
    if (filter.driverId) query = query.eq("driver_id", filter.driverId);
    if (filter.shiftId) query = query.eq("shift_id", filter.shiftId);
    if (filter.batchId) query = query.eq("notice_batch_id", filter.batchId);
    if (filter.inboundOutcomes?.length) query = query.in("inbound_outcome", filter.inboundOutcomes);
    const result = await query.order("created_at", { ascending: false }).limit(filter.limit ?? 2000);
    return this.unwrap(result).map(mapSmsMessage);
  }

  async findMessage(id: string): Promise<SmsMessage | null> {
    const rows = this.unwrap(await this.supabase.from("sms_messages").select("*").eq("id", id).limit(1));
    return rows[0] ? mapSmsMessage(rows[0]) : null;
  }

  async hasResend(id: string): Promise<boolean> {
    const rows = this.unwrap(await this.supabase.from("sms_messages").select("id").eq("resend_of", id).limit(1));
    return rows.length > 0;
  }

  async listBroadcastShifts(from: string, to: string): Promise<{ shift: Shift; companyName: string }[]> {
    const rows = this.unwrap(
      await this.supabase
        .from("shifts")
        .select("*, carriers!inner(company_name)")
        .gte("broadcast_at", from)
        .lt("broadcast_at", to)
        .order("broadcast_at", { ascending: false })
        .limit(500),
    );
    return rows.map((row) => ({ shift: mapShift(row), companyName: row.carriers.company_name }));
  }

  async findShift(shiftId: string): Promise<{ shift: Shift; companyName: string } | null> {
    const rows = this.unwrap(
      await this.supabase.from("shifts").select("*, carriers!inner(company_name)").eq("id", shiftId).limit(1),
    );
    return rows[0] ? { shift: mapShift(rows[0]), companyName: rows[0].carriers.company_name } : null;
  }

  async listRecipients(shiftIds: string[]): Promise<BroadcastRecipient[]> {
    if (shiftIds.length === 0) return [];
    const rows = this.unwrap(
      await this.supabase
        .from("broadcast_recipients")
        .select("*")
        .in("shift_id", shiftIds)
        .order("round", { ascending: false })
        .order("position", { ascending: true }),
    );
    return rows.map(mapRecipient);
  }

  async countBookedShifts(from: string, to: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("shifts")
      .select("id", { count: "exact", head: true })
      .gte("booked_at", from)
      .lt("booked_at", to);
    if (error) throw this.toAppError(error);
    return count ?? 0;
  }

  async listBatches(from: string, to: string): Promise<NoticeBatch[]> {
    const rows = this.unwrap(
      await this.supabase
        .from("notice_batches")
        .select("*")
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at", { ascending: false }),
    );
    return rows.map(mapNoticeBatch);
  }

  async findBatch(id: string): Promise<NoticeBatch | null> {
    const rows = this.unwrap(await this.supabase.from("notice_batches").select("*").eq("id", id).limit(1));
    return rows[0] ? mapNoticeBatch(rows[0]) : null;
  }

  async driverNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = this.unwrap(await this.supabase.from("drivers").select("id, full_name").in("id", unique));
    return new Map(rows.map((row) => [row.id, row.full_name]));
  }
}
