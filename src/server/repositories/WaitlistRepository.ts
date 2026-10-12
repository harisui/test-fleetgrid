import { AppError } from "@/server/errors/AppError";
import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { WaitlistEntry } from "@/types/domain";

type WaitlistRow = Database["public"]["Tables"]["carrier_waitlist"]["Row"];

export interface WaitlistInput {
  carrierId: string;
  zip: string;
  lat: number;
  lng: number;
}

export interface IWaitlistRepository {
  findByCarrierId(carrierId: string): Promise<WaitlistEntry | null>;
  /** Adds the carrier. Joining twice keeps the first entry. */
  create(input: WaitlistInput): Promise<WaitlistEntry>;
}

export function mapWaitlistEntry(row: WaitlistRow): WaitlistEntry {
  return {
    id: row.id,
    carrierId: row.carrier_id,
    zip: row.zip,
    lat: row.lat,
    lng: row.lng,
    createdAt: row.created_at,
  };
}

export class WaitlistRepository extends BaseRepository implements IWaitlistRepository {
  async findByCarrierId(carrierId: string): Promise<WaitlistEntry | null> {
    const result = await this.supabase
      .from("carrier_waitlist")
      .select("*")
      .eq("carrier_id", carrierId)
      .maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapWaitlistEntry(row) : null;
  }

  async create(input: WaitlistInput): Promise<WaitlistEntry> {
    const result = await this.supabase
      .from("carrier_waitlist")
      .insert({ carrier_id: input.carrierId, zip: input.zip, lat: input.lat, lng: input.lng })
      .select("*")
      .single();
    try {
      return mapWaitlistEntry(this.unwrap(result));
    } catch (error) {
      if (error instanceof AppError && error.code === "CONFLICT") {
        const existing = await this.findByCarrierId(input.carrierId);
        if (existing) return existing;
      }
      throw error;
    }
  }
}
