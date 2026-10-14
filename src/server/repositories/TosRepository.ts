import { AppError } from "@/server/errors/AppError";
import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { TosAcceptance } from "@/types/domain";

type TosRow = Database["public"]["Tables"]["tos_acceptances"]["Row"];

export interface TosAcceptanceInput {
  profileId: string;
  version: string;
  ip: string | null;
  userAgent: string | null;
}

export interface ITosRepository {
  findAcceptance(profileId: string, version: string): Promise<TosAcceptance | null>;
  /** Records the acceptance. Accepting the same version twice keeps the first record. */
  record(input: TosAcceptanceInput): Promise<TosAcceptance>;
}

export function mapTosAcceptance(row: TosRow): TosAcceptance {
  return {
    id: row.id,
    profileId: row.profile_id,
    version: row.version,
    acceptedAt: row.accepted_at,
    ip: row.ip,
    userAgent: row.user_agent,
  };
}

export class TosRepository extends BaseRepository implements ITosRepository {
  async findAcceptance(profileId: string, version: string): Promise<TosAcceptance | null> {
    const result = await this.supabase
      .from("tos_acceptances")
      .select("*")
      .eq("profile_id", profileId)
      .eq("version", version)
      .maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapTosAcceptance(row) : null;
  }

  async record(input: TosAcceptanceInput): Promise<TosAcceptance> {
    const result = await this.supabase
      .from("tos_acceptances")
      .insert({
        profile_id: input.profileId,
        version: input.version,
        ip: input.ip,
        user_agent: input.userAgent,
      })
      .select("*")
      .single();
    try {
      return mapTosAcceptance(this.unwrap(result));
    } catch (error) {
      if (error instanceof AppError && error.code === "CONFLICT") {
        const existing = await this.findAcceptance(input.profileId, input.version);
        if (existing) return existing;
      }
      throw error;
    }
  }
}
