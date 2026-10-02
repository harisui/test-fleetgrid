import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { Profile, SignupRole } from "@/types/domain";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export interface CreateProfileInput {
  id: string;
  phone: string;
  role: SignupRole;
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
    const result = await this.supabase
      .from("profiles")
      .insert({ id: input.id, phone: input.phone, role: input.role })
      .select("*")
      .single();
    return mapProfile(this.unwrap(result));
  }
}
