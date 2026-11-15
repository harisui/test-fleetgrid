import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { DriverAwaitingTerms } from "@/types/domain";

/** A Terms version to archive (src/content/legal/terms.ts). */
export interface TermsVersionInput {
  version: string;
  title: string;
  effectiveDate: string;
  body: string;
  requiresReacceptance: boolean;
}

export interface TermsLink {
  profileId: string;
  version: string;
  expiresAt: string;
  usedAt: string | null;
}

export type LinkAcceptanceOutcome = "accepted" | "used" | "expired" | "not_found";

/** The signed-in user's side (RLS): whether they have accepted everything they must. */
export interface ITermsRepository {
  myTermsOk(): Promise<boolean>;
}

/**
 * The service role's side (0040): publishing versions, the one-time links and who is still
 * waiting. Built on demand with the admin client; never handed a user's session.
 */
export interface ITermsAdminRepository {
  /** Archives the version, or confirms it is archived with exactly this text. Returns the stored hash. */
  publish(input: TermsVersionInput): Promise<{ bodySha256: string }>;
  requiredVersion(): Promise<string | null>;
  driversAwaiting(): Promise<DriverAwaitingTerms[]>;
  /** A new link for the driver; their earlier unused links stop working. */
  createLink(input: { profileId: string; version: string; tokenHash: string; expiresAt: string; createdBy: string | null }): Promise<void>;
  findLink(tokenHash: string): Promise<TermsLink | null>;
  acceptByLink(input: {
    tokenHash: string;
    ip: string | null;
    userAgent: string | null;
    statement: string;
  }): Promise<{ outcome: LinkAcceptanceOutcome; profileId: string | null }>;
}

export class TermsRepository extends BaseRepository implements ITermsRepository {
  async myTermsOk(): Promise<boolean> {
    return this.unwrap(await this.supabase.rpc("my_terms_ok"));
  }
}

export class TermsAdminRepository extends BaseRepository implements ITermsAdminRepository {
  async publish(input: TermsVersionInput): Promise<{ bodySha256: string }> {
    const result = await this.supabase
        .rpc("publish_terms_version", {
          p_version: input.version,
          p_title: input.title,
          p_effective_date: input.effectiveDate,
          p_body: input.body,
          p_requires_reacceptance: input.requiresReacceptance,
        })
        .single();
    return { bodySha256: this.unwrap(result).body_sha256 };
  }

  async requiredVersion(): Promise<string | null> {
    return this.unwrapMaybe(await this.supabase.rpc("required_terms_version"));
  }

  async driversAwaiting(): Promise<DriverAwaitingTerms[]> {
    const rows = this.unwrapMaybe(await this.supabase.rpc("drivers_awaiting_terms")) ?? [];
    return rows.map((row) => ({
      profileId: row.profile_id,
      driverId: row.driver_id,
      fullName: row.full_name,
      phone: row.phone,
      smsOptIn: row.sms_opt_in,
      smsOptedOut: row.sms_opted_out,
      lastLinkAt: row.last_link_at,
    }));
  }

  async createLink(input: { profileId: string; version: string; tokenHash: string; expiresAt: string; createdBy: string | null }): Promise<void> {
    const now = new Date().toISOString();
    // One live link per driver: the earlier unused ones end now.
    this.unwrapMaybe(
      await this.supabase
        .from("driver_terms_links")
        .update({ expires_at: now })
        .eq("profile_id", input.profileId)
        .is("used_at", null)
        .gt("expires_at", now),
    );
    this.unwrapMaybe(
      await this.supabase.from("driver_terms_links").insert({
        profile_id: input.profileId,
        version: input.version,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
        created_by: input.createdBy,
      }),
    );
  }

  async findLink(tokenHash: string): Promise<TermsLink | null> {
    const result = await this.supabase
      .from("driver_terms_links")
      .select("profile_id, version, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? { profileId: row.profile_id, version: row.version, expiresAt: row.expires_at, usedAt: row.used_at } : null;
  }

  async acceptByLink(input: {
    tokenHash: string;
    ip: string | null;
    userAgent: string | null;
    statement: string;
  }): Promise<{ outcome: LinkAcceptanceOutcome; profileId: string | null }> {
    const result = await this.supabase
        .rpc("accept_terms_by_link", {
          p_token_hash: input.tokenHash,
          p_statement: input.statement,
          ...(input.ip ? { p_ip: input.ip } : {}),
          ...(input.userAgent ? { p_user_agent: input.userAgent } : {}),
        })
        .single();
    const row = this.unwrap(result);
    return { outcome: row.outcome as LinkAcceptanceOutcome, profileId: row.profile_id };
  }
}
