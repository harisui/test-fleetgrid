import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { Profile, SignupRole, SignupSource } from "@/types/domain";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export interface CreateProfileInput {
  id: string;
  phone: string;
  role: SignupRole;
  /** Where the sign-up came from, from the first-touch cookie. Omitted for a direct visit. */
  source?: Partial<SignupSource>;
}

export interface IProfileRepository {
  findById(id: string): Promise<Profile | null>;
  create(input: CreateProfileInput): Promise<Profile>;
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    role: row.role,
    phone: row.phone,
    status: row.status,
    source: {
      utmSource: row.signup_utm_source,
      utmMedium: row.signup_utm_medium,
      utmCampaign: row.signup_utm_campaign,
      utmContent: row.signup_utm_content,
      referrer: row.signup_referrer,
      landingPath: row.signup_landing_path,
      qrLinkId: row.qr_link_id,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProfileRepository extends BaseRepository implements IProfileRepository {
  async findById(id: string): Promise<Profile | null> {
    const result = await this.supabase.from("profiles").select("*").eq("id", id).maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapProfile(row) : null;
  }

  async create(input: CreateProfileInput): Promise<Profile> {
    const source = input.source ?? {};
    const result = await this.supabase
      .from("profiles")
      .insert({
        id: input.id,
        phone: input.phone,
        role: input.role,
        signup_utm_source: source.utmSource ?? null,
        signup_utm_medium: source.utmMedium ?? null,
        signup_utm_campaign: source.utmCampaign ?? null,
        signup_utm_content: source.utmContent ?? null,
        signup_referrer: source.referrer ?? null,
        signup_landing_path: source.landingPath ?? null,
        qr_link_id: source.qrLinkId ?? null,
      })
      .select("*")
      .single();
    return mapProfile(this.unwrap(result));
  }
}
