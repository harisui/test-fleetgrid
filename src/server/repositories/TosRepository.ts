import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { TosAcceptance, TosAcceptanceMethod } from "@/types/domain";

type TosRow = Database["public"]["Tables"]["tos_acceptances"]["Row"];

export interface TosAcceptanceInput {
  profileId: string;
  version: string;
  ip: string | null;
  userAgent: string | null;
  /** How it was given (0040): carriers on their Terms page, drivers at sign-up or on the Terms page. */
  method?: Exclude<TosAcceptanceMethod, "link">;
  /** The checkbox wording shown. */
  statement?: string;
}

export interface ITosRepository {
  findAcceptance(profileId: string, version: string): Promise<TosAcceptance | null>;
  /** Records the acceptance. Accepting the same version twice keeps the first record. */
  record(input: TosAcceptanceInput): Promise<TosAcceptance>;
}

export function mapTosAcceptance(row: TosRow): TosAcceptance {
  return {
    id: row.id,
    profileId: row.profile_id ?? "",
    version: row.version,
    acceptedAt: row.accepted_at,
    ip: row.ip,
    userAgent: row.user_agent,
    method: (row.method as TosAcceptanceMethod | null) ?? null,
    statement: row.statement,
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
      .rpc("record_tos_acceptance", {
        p_version: input.version,
        ...(input.ip ? { p_ip: input.ip } : {}),
        ...(input.userAgent ? { p_user_agent: input.userAgent } : {}),
        ...(input.method ? { p_method: input.method } : {}),
        ...(input.statement ? { p_statement: input.statement } : {}),
      })
      .single();
    return mapTosAcceptance(this.unwrap(result));
  }
}
