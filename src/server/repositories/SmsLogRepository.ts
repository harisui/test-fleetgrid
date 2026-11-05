import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import { INBOUND_OUTCOMES, type InboundOutcome, type SmsDirection, type SmsMessage } from "@/types/domain";

type SmsRow = Database["public"]["Tables"]["sms_messages"]["Row"];
type SmsViewRow = Database["public"]["Views"]["sms_messages_current"]["Row"];

/** A row of sms_messages_current: a view's columns read as nullable, the table's are not. */
export function mapSmsMessage(view: SmsViewRow): SmsMessage {
  const row = view as SmsRow;
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
    noticeBatchId: row.notice_batch_id,
    resendOf: row.resend_of,
    inboundOutcome: INBOUND_OUTCOMES.find((value) => value === row.inbound_outcome) ?? null,
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
  noticeBatchId?: string | null;
  resendOf?: string | null;
}

export interface SmsContext {
  kind?: string;
  shiftId?: string | null;
  driverId?: string | null;
  inboundOutcome?: InboundOutcome;
}

export interface ISmsLogRepository {
  /**
   * Records a text and returns its id. Null when it is already logged: the same provider id
   * (a webhook retry) or the same resend_of (a second resend).
   */
  record(entry: SmsLogEntry): Promise<string | null>;
  /** The provider's answer onto a text recorded before it was sent. */
  updateById(id: string, update: { providerSid: string | null; status: string; errorCode: string | null }): Promise<void>;
  updateStatus(sid: string, status: string, errorCode: string | null): Promise<void>;
  /** True when this call should handle the reply: new, or left unfinished for 60 seconds. */
  beginInbound(sid: string): Promise<boolean>;
  finishInbound(sid: string): Promise<void>;
  listUnfinishedInbound(before: string): Promise<{ sid: string; from: string; to: string; body: string }[]>;
  findBySid(sid: string): Promise<SmsMessage | null>;
  /** Held texts that may still go, oldest first. Never shift alerts: they would be out of date. */
  listHeld(limit?: number): Promise<SmsMessage[]>;
  /** Takes a held text to send it; false when another run took it first. */
  claimHeld(id: string): Promise<boolean>;
  setContext(sid: string, context: SmsContext): Promise<void>;
  listByShift(shiftId: string): Promise<SmsMessage[]>;
  listRecent(limit?: number): Promise<SmsMessage[]>;
}

/** Every text in and out (0023). Written by the service role, read by admins. */
export class SmsLogRepository extends BaseRepository implements ISmsLogRepository {
  async record(entry: SmsLogEntry): Promise<string | null> {
    const result = await this.supabase.rpc("log_sms_message", {
      p_direction: entry.direction,
      p_kind: entry.kind,
      p_from: entry.fromPhone,
      p_to: entry.toPhone,
      p_body: entry.body,
      ...(entry.providerSid ? { p_provider_sid: entry.providerSid } : {}),
      ...(entry.status ? { p_status: entry.status } : {}),
      ...(entry.errorCode ? { p_error_code: entry.errorCode } : {}),
      ...(entry.shiftId ? { p_shift_id: entry.shiftId } : {}),
      ...(entry.driverId ? { p_driver_id: entry.driverId } : {}),
      ...(entry.noticeBatchId ? { p_notice_batch_id: entry.noticeBatchId } : {}),
      ...(entry.resendOf ? { p_resend_of: entry.resendOf } : {}),
    });
    return this.unwrapMaybe(result) ?? null;
  }

  async updateById(
    id: string,
    update: { providerSid: string | null; status: string; errorCode: string | null },
  ): Promise<void> {
    const { error } = await this.supabase.rpc("sms_record_result", {
      p_id: id,
      p_provider_sid: update.providerSid as string,
      p_status: update.status,
      p_error_code: update.errorCode as string,
    });
    if (error) throw this.toAppError(error);
  }

  async updateStatus(sid: string, status: string, errorCode: string | null): Promise<void> {
    const { error } = await this.supabase.rpc("sms_record_status", { p_provider_sid: sid, p_status: status, p_error_code: errorCode as string });
    if (error) throw this.toAppError(error);
  }

  async setContext(sid: string, context: SmsContext): Promise<void> {
    const { error } = await this.supabase.rpc("sms_record_outcome", {
      p_provider_sid: sid,
      ...(context.inboundOutcome !== undefined ? { p_inbound_outcome: context.inboundOutcome } : {}),
      ...(context.shiftId ? { p_shift_id: context.shiftId } : {}),
    });
    if (error) throw this.toAppError(error);
  }

  async beginInbound(sid: string): Promise<boolean> {
    return this.unwrap(await this.supabase.rpc("begin_inbound", { p_sid: sid })) === true;
  }

  async finishInbound(sid: string): Promise<void> {
    const { error } = await this.supabase.rpc("finish_inbound", { p_sid: sid });
    if (error) throw this.toAppError(error);
  }

  async listUnfinishedInbound(before: string) {
    const rows = this.unwrap(await this.supabase.rpc("unfinished_inbound", { p_before: before }));
    return rows.map((row) => ({ sid: row.provider_sid, from: row.from_phone, to: row.to_phone, body: row.body }));
  }

  async findBySid(sid: string): Promise<SmsMessage | null> {
    const rows = this.unwrap(await this.supabase.from("sms_messages_current").select("*").eq("provider_sid", sid).limit(1));
    return rows[0] ? mapSmsMessage(rows[0]) : null;
  }

  async listHeld(limit = 500): Promise<SmsMessage[]> {
    const result = await this.supabase
      .from("sms_messages_current")
      .select("*")
      .eq("direction", "outbound")
      .eq("status", "held")
      .neq("kind", "offer")
      .order("created_at")
      .limit(limit);
    return this.unwrap(result).map(mapSmsMessage);
  }

  async claimHeld(id: string): Promise<boolean> {
    return this.unwrap(await this.supabase.rpc("sms_claim_held", { p_id: id })) === true;
  }

  async listByShift(shiftId: string): Promise<SmsMessage[]> {
    const result = await this.supabase
      .from("sms_messages_current")
      .select("*")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: true });
    return this.unwrap(result).map(mapSmsMessage);
  }

  async listRecent(limit = 100): Promise<SmsMessage[]> {
    const result = await this.supabase
      .from("sms_messages_current")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return this.unwrap(result).map(mapSmsMessage);
  }
}
