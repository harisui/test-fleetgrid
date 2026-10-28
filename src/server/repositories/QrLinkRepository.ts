import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { QrLink, QrScan } from "@/types/domain";

type QrLinkRow = Database["public"]["Tables"]["qr_links"]["Row"];
type QrScanRow = Database["public"]["Tables"]["qr_scans"]["Row"];

export interface CreateQrLinkInput {
  slug: string;
  locationName: string;
  campaign: string;
  targetPath: string;
  createdBy: string;
}

export interface RecordScanInput {
  qrLinkId: string;
  ipHash: string | null;
  userAgent: string | null;
}

export interface IQrLinkRepository {
  /** Every code, newest first. */
  list(): Promise<QrLink[]>;
  findById(id: string): Promise<QrLink | null>;
  findBySlug(slug: string): Promise<QrLink | null>;
  create(input: CreateQrLinkInput): Promise<QrLink>;
  setActive(id: string, isActive: boolean): Promise<QrLink>;
}

export interface IQrScanRepository {
  /** Logs one visit. The short-link route does this with the service role. */
  record(input: RecordScanInput): Promise<QrScan>;
  /** Every scan since the moment given (all of them when omitted), for counting. */
  listSince(since?: Date): Promise<QrScan[]>;
}

export function mapQrLink(row: QrLinkRow): QrLink {
  return {
    id: row.id,
    slug: row.slug,
    locationName: row.location_name,
    campaign: row.campaign,
    targetPath: row.target_path,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQrScan(row: Pick<QrScanRow, "id" | "qr_link_id" | "scanned_at">): QrScan {
  return { id: row.id, qrLinkId: row.qr_link_id, scannedAt: row.scanned_at };
}

/** The QR codes. Admins read and write them under RLS; the short-link route reads with the service role. */
export class QrLinkRepository extends BaseRepository implements IQrLinkRepository {
  async list(): Promise<QrLink[]> {
    const rows = this.unwrap(
      await this.supabase.from("qr_links").select("*").order("created_at", { ascending: false }),
    );
    return rows.map(mapQrLink);
  }

  async findById(id: string): Promise<QrLink | null> {
    const row = this.unwrapMaybe(await this.supabase.from("qr_links").select("*").eq("id", id).maybeSingle());
    return row ? mapQrLink(row) : null;
  }

  async findBySlug(slug: string): Promise<QrLink | null> {
    const row = this.unwrapMaybe(await this.supabase.from("qr_links").select("*").eq("slug", slug).maybeSingle());
    return row ? mapQrLink(row) : null;
  }

  async create(input: CreateQrLinkInput): Promise<QrLink> {
    const result = await this.supabase
      .from("qr_links")
      .insert({
        slug: input.slug,
        location_name: input.locationName,
        campaign: input.campaign,
        target_path: input.targetPath,
        created_by: input.createdBy,
      })
      .select("*")
      .single();
    return mapQrLink(this.unwrap(result));
  }

  async setActive(id: string, isActive: boolean): Promise<QrLink> {
    const result = await this.supabase
      .from("qr_links")
      .update({ is_active: isActive })
      .eq("id", id)
      .select("*")
      .single();
    return mapQrLink(this.unwrap(result));
  }
}

/** The scans. Written with the service role, read by admins. */
export class QrScanRepository extends BaseRepository implements IQrScanRepository {
  async record(input: RecordScanInput): Promise<QrScan> {
    const result = await this.supabase
      .from("qr_scans")
      .insert({ qr_link_id: input.qrLinkId, ip_hash: input.ipHash, user_agent: input.userAgent })
      .select("id, qr_link_id, scanned_at")
      .single();
    return mapQrScan(this.unwrap(result));
  }

  async listSince(since?: Date): Promise<QrScan[]> {
    let query = this.supabase.from("qr_scans").select("id, qr_link_id, scanned_at");
    if (since) query = query.gte("scanned_at", since.toISOString());
    const rows = this.unwrap(await query.order("scanned_at", { ascending: false }));
    return rows.map(mapQrScan);
  }
}
