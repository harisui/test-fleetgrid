import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { Carrier } from "@/types/domain";

type CarrierRow = Database["public"]["Tables"]["carriers"]["Row"];
type CarrierUpdate = Database["public"]["Tables"]["carriers"]["Update"];

/** Everything the onboarding form collects, with the place the dataset gives the ZIP. */
export interface CreateCarrierInput {
  companyName: string;
  contactName: string;
  billingEmail: string;
  usdot: string | null;
  mc: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
}

/** Any subset of the editable columns. The Stripe customer id is for the service role only. */
export interface CarrierPatch {
  companyName?: string;
  contactName?: string;
  billingEmail?: string;
  usdot?: string | null;
  mc?: string | null;
  city?: string;
  state?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  stripeCustomerId?: string | null;
}

export interface ICarrierRepository {
  findByProfileId(profileId: string): Promise<Carrier | null>;
  findById(id: string): Promise<Carrier | null>;
  findByStripeCustomerId(customerId: string): Promise<Carrier | null>;
  create(profileId: string, input: CreateCarrierInput): Promise<Carrier>;
  update(carrierId: string, patch: CarrierPatch): Promise<Carrier>;
}

export function mapCarrier(row: CarrierRow): Carrier {
  return {
    id: row.id,
    profileId: row.profile_id,
    companyName: row.company_name,
    contactName: row.contact_name,
    billingEmail: row.billing_email,
    usdot: row.usdot,
    mc: row.mc,
    city: row.city,
    state: row.state,
    zip: row.zip,
    lat: row.lat,
    lng: row.lng,
    stripeCustomerId: row.stripe_customer_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps only the keys present in the patch, so untouched columns keep their values. */
export function toCarrierUpdate(patch: CarrierPatch): CarrierUpdate {
  const columns: { [K in keyof CarrierPatch]-?: keyof CarrierUpdate } = {
    companyName: "company_name",
    contactName: "contact_name",
    billingEmail: "billing_email",
    usdot: "usdot",
    mc: "mc",
    city: "city",
    state: "state",
    zip: "zip",
    lat: "lat",
    lng: "lng",
    stripeCustomerId: "stripe_customer_id",
  };
  const update: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    const value = patch[key as keyof CarrierPatch];
    if (value !== undefined) update[column] = value;
  }
  return update as CarrierUpdate;
}

export class CarrierRepository extends BaseRepository implements ICarrierRepository {
  async findByProfileId(profileId: string): Promise<Carrier | null> {
    const result = await this.supabase
      .from("carriers")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapCarrier(row) : null;
  }

  async findById(id: string): Promise<Carrier | null> {
    const result = await this.supabase.from("carriers").select("*").eq("id", id).maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapCarrier(row) : null;
  }

  async findByStripeCustomerId(customerId: string): Promise<Carrier | null> {
    const result = await this.supabase
      .from("carriers")
      .select("*")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapCarrier(row) : null;
  }

  async create(profileId: string, input: CreateCarrierInput): Promise<Carrier> {
    const result = await this.supabase
      .from("carriers")
      .insert({
        profile_id: profileId,
        company_name: input.companyName,
        contact_name: input.contactName,
        billing_email: input.billingEmail,
        usdot: input.usdot,
        mc: input.mc,
        city: input.city,
        state: input.state,
        zip: input.zip,
        lat: input.lat,
        lng: input.lng,
      })
      .select("*")
      .single();
    return mapCarrier(this.unwrap(result));
  }

  async update(carrierId: string, patch: CarrierPatch): Promise<Carrier> {
    const result = await this.supabase
      .from("carriers")
      .update(toCarrierUpdate(patch))
      .eq("id", carrierId)
      .select("*")
      .single();
    return mapCarrier(this.unwrap(result));
  }
}
