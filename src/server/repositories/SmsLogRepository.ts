import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { SmsDirection, SmsMessage } from "@/types/domain";

type SmsRow = Database["public"]["Tables"]["sms_messages"]["Row"];

export function mapSmsMessage(row: SmsRow): SmsMessage {
  return {
    id: row.id,
    direction: row.direction,
    kind: row.kind,
    fromPhone: row.from_phone,
    toPhone: row.to_phone,
    body: row.body,
    providerSid: row.provider_sid,
    status: row.status,
    errorCode: row.error_code,
    shiftId: row.shift_id,
    driverId: row.driver_id,
    createdAt: row.created_at,
  };
}

export interface SmsLogEntry {
  direction: SmsDirection;
  kind: string;
  fromPhone: string;
  toPhone: string;
  body: string;
  providerSid: string | null;
  status: string | null;
  errorCode?: string | null;
  shiftId?: string | null;
  driverId?: string | null;
}

export interface ISmsLogRepository {
  /** Records a text. False when a text with this provider id is already logged (a retry). */
  record(entry: SmsLogEntry): Promise<boolean>;
  updateStatus(sid: string, status: string, errorCode: string | null): Promise<void>;
  setContext(sid: string, context: { kind?: string; shiftId?: string | null; driverId?: string | null }): Promise<void>;
  listByShift(shiftId: string): Promise<SmsMessage[]>;
  listRecent(limit?: number): Promise<SmsMessage[]>;
}

/** Every text in and out (0023). Written by the service role, read by admins. */
export class SmsLogRepository extends BaseRepository implements ISmsLogRepository {
  async record(entry: SmsLogEntry): Promise<boolean> {
    const { error } = await this.supabase.from("sms_messages").insert({
      direction: entry.direction,
      kind: entry.kind,
      from_phone: entry.fromPhone,
      to_phone: entry.toPhone,
      body: entry.body,
      provider_sid: entry.providerSid,
      status: entry.status,
      error_code: entry.errorCode ?? null,
      shift_id: entry.shiftId ?? null,
      driver_id: entry.driverId ?? null,
    });
    if (error?.code === "23505") return false;
    if (error) throw this.toAppError(error);
    return true;
  }

  async updateStatus(sid: string, status: string, errorCode: string | null): Promise<void> {
    const { error } = await this.supabase
      .from("sms_messages")
      .update({ status, error_code: errorCode })
      .eq("provider_sid", sid);
    if (error) throw this.toAppError(error);
  }

  async setContext(
    sid: string,
    context: { kind?: string; shiftId?: string | null; driverId?: string | null },
  ): Promise<void> {
    const { error } = await this.supabase
      .from("sms_messages")
      .update({
        ...(context.kind ? { kind: context.kind } : {}),
        ...(context.shiftId !== undefined ? { shift_id: context.shiftId } : {}),
        ...(context.driverId !== undefined ? { driver_id: context.driverId } : {}),
      })
      .eq("provider_sid", sid);
    if (error) throw this.toAppError(error);
  }

  async listByShift(shiftId: string): Promise<SmsMessage[]> {
    const result = await this.supabase
      .from("sms_messages")
      .select("*")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: true });
    return this.unwrap(result).map(mapSmsMessage);
  }

  async listRecent(limit = 100): Promise<SmsMessage[]> {
    const result = await this.supabase
      .from("sms_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return this.unwrap(result).map(mapSmsMessage);
  }
}
