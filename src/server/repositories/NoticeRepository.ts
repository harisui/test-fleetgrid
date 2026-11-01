import { BaseRepository } from "@/server/repositories/BaseRepository";
import { mapNoticeBatch } from "@/server/repositories/MessagingRepository";
import { mapServiceArea } from "@/server/repositories/ServiceAreaRepository";
import type { Json } from "@/types/database.types";
import type { AccountStatus, NoticeBatch, NoticeCategory, ServiceArea } from "@/types/domain";

/** A driver and why a bulk notice would leave them out (null: they get it). */
export interface NoticeCandidate {
  driverId: string;
  phone: string;
  exclusion: "opted_out" | "no_consent" | "blocked" | null;
}

export interface NewNoticeBatch {
  category: NoticeCategory;
  variables: Record<string, string>;
  body: string;
  areaId: string | null;
  createdBy: string;
  restoresBatchId: string | null;
  recipientCount: number;
  excludedOptedOut: number;
  excludedNoConsent: number;
  excludedBlocked: number;
  sendAfter: string | null;
}

/** A driver as the security notice's search shows them. */
export interface DriverChoice {
  driverId: string;
  fullName: string;
  phone: string;
  status: AccountStatus;
  smsOptIn: boolean;
  smsOptedOut: boolean;
}

export interface INoticeRepository {
  candidates(areaId: string | null): Promise<NoticeCandidate[]>;
  insertBatch(batch: NewNoticeBatch): Promise<NoticeBatch>;
  /** Moves a queued batch to sending; null when another run already took it. */
  claimBatch(id: string): Promise<NoticeBatch | null>;
  finishBatch(id: string, recipientCount: number): Promise<void>;
  listDue(now: string): Promise<NoticeBatch[]>;
  listSince(category: NoticeCategory, since: string): Promise<NoticeBatch[]>;
  findBatch(id: string): Promise<NoticeBatch | null>;
  restoredBatchIds(ids: string[]): Promise<string[]>;
  listActiveAreas(): Promise<ServiceArea[]>;
  searchDrivers(query: string): Promise<DriverChoice[]>;
  findDriver(driverId: string): Promise<DriverChoice | null>;
}

const DRIVER_SELECT = "id, full_name, sms_opt_in, sms_opted_out, profiles!inner(phone, status, role)";

interface DriverRow {
  id: string;
  full_name: string;
  sms_opt_in: boolean;
  sms_opted_out: boolean;
  profiles: { phone: string; status: AccountStatus; role: string };
}

const toChoice = (row: DriverRow): DriverChoice => ({
  driverId: row.id,
  fullName: row.full_name,
  phone: row.profiles.phone,
  status: row.profiles.status,
  smsOptIn: row.sms_opt_in,
  smsOptedOut: row.sms_opted_out,
});

/** Admin notices (CR-3, 0026). Service role: recipients and the batches are written by the server. */
export class NoticeRepository extends BaseRepository implements INoticeRepository {
  async candidates(areaId: string | null): Promise<NoticeCandidate[]> {
    const result = await this.supabase.rpc("notice_recipients", areaId ? { p_area_id: areaId } : {});
    return this.unwrap(result).map((row) => ({
      driverId: row.driver_id,
      phone: row.phone,
      exclusion: row.exclusion === "opted_out" || row.exclusion === "no_consent" || row.exclusion === "blocked" ? row.exclusion : null,
    }));
  }

  async insertBatch(batch: NewNoticeBatch): Promise<NoticeBatch> {
    const result = await this.supabase
      .from("notice_batches")
      .insert({
        category: batch.category,
        variables: batch.variables as NonNullable<Json>,
        body: batch.body,
        area_id: batch.areaId,
        created_by: batch.createdBy,
        restores_batch_id: batch.restoresBatchId,
        recipient_count: batch.recipientCount,
        excluded_opted_out: batch.excludedOptedOut,
        excluded_no_consent: batch.excludedNoConsent,
        excluded_blocked: batch.excludedBlocked,
        send_after: batch.sendAfter,
      })
      .select("*")
      .single();
    return mapNoticeBatch(this.unwrap(result));
  }

  async claimBatch(id: string): Promise<NoticeBatch | null> {
    const rows = this.unwrap(
      await this.supabase.from("notice_batches").update({ status: "sending" }).eq("id", id).eq("status", "queued").select("*"),
    );
    return rows[0] ? mapNoticeBatch(rows[0]) : null;
  }

  async finishBatch(id: string, recipientCount: number): Promise<void> {
    const { error } = await this.supabase
      .from("notice_batches")
      .update({ status: "sent", sent_at: new Date().toISOString(), recipient_count: recipientCount })
      .eq("id", id);
    if (error) throw this.toAppError(error);
  }

  async listDue(now: string): Promise<NoticeBatch[]> {
    const rows = this.unwrap(
      await this.supabase.from("notice_batches").select("*").eq("status", "queued").lte("send_after", now).limit(20),
    );
    return rows.map(mapNoticeBatch);
  }

  async listSince(category: NoticeCategory, since: string): Promise<NoticeBatch[]> {
    const rows = this.unwrap(
      await this.supabase
        .from("notice_batches")
        .select("*")
        .eq("category", category)
        .gte("created_at", since)
        .order("created_at", { ascending: false }),
    );
    return rows.map(mapNoticeBatch);
  }

  async findBatch(id: string): Promise<NoticeBatch | null> {
    const rows = this.unwrap(await this.supabase.from("notice_batches").select("*").eq("id", id).limit(1));
    return rows[0] ? mapNoticeBatch(rows[0]) : null;
  }

  async restoredBatchIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = this.unwrap(
      await this.supabase.from("notice_batches").select("restores_batch_id").in("restores_batch_id", ids),
    );
    return rows.map((row) => row.restores_batch_id).filter((id): id is string => id !== null);
  }

  async listActiveAreas(): Promise<ServiceArea[]> {
    const rows = this.unwrap(await this.supabase.from("service_areas").select("*").eq("is_active", true).order("name"));
    return rows.map(mapServiceArea);
  }

  async searchDrivers(query: string): Promise<DriverChoice[]> {
    const digits = query.replace(/\D/g, "");
    let request = this.supabase.from("drivers").select(DRIVER_SELECT).eq("profiles.role", "driver").limit(10);
    request =
      digits.length >= 4
        ? request.like("profiles.phone", `%${digits}%`)
        : request.ilike("full_name", `%${query.replace(/[%_]/g, "")}%`);
    const rows = this.unwrap(await request) as DriverRow[];
    return rows.map(toChoice);
  }

  async findDriver(driverId: string): Promise<DriverChoice | null> {
    const rows = this.unwrap(await this.supabase.from("drivers").select(DRIVER_SELECT).eq("id", driverId).limit(1)) as DriverRow[];
    return rows[0] ? toChoice(rows[0]) : null;
  }
}
