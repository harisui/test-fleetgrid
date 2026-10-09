import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type {
  AvailabilityType,
  CdlClass,
  Driver,
  DrivingStyle,
  EmploymentType,
  Endorsement,
  EquipmentType,
  MvrStatus,
  OperatorType,
  TransmissionType,
} from "@/types/domain";

type DriverRow = Database["public"]["Tables"]["drivers"]["Row"];
type DriverUpdate = Database["public"]["Tables"]["drivers"]["Update"];

/** Fields needed to create the card on the first onboarding screen (the name). */
export interface CreateDriverInput {
  fullName: string;
  onboardingStep: number;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  serviceRadiusMiles?: number;
}

/** Any subset of editable card fields. Owner and opt-out state are not editable here. */
export interface DriverPatch {
  fullName?: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  serviceRadiusMiles?: number;
  lat?: number | null;
  lng?: number | null;
  operatorTypes?: OperatorType[];
  cdlClass?: CdlClass;
  endorsements?: Endorsement[];
  yearsExperience?: number;
  certifications?: string[];
  availability?: AvailabilityType[];
  bio?: string | null;
  employmentType?: EmploymentType | null;
  drivingStyles?: DrivingStyle[];
  transmission?: TransmissionType | null;
  equipmentTypes?: EquipmentType[];
  twicActive?: boolean | null;
  medicalCardActive?: boolean | null;
  clearinghouseRegistered?: boolean | null;
  mvrStatus?: MvrStatus | null;
  smsOptIn?: boolean;
  smsOptInAt?: string;
  smsOptInText?: string;
  onboardingStep?: number;
  cardCompleted?: boolean;
}

export interface IDriverRepository {
  findByProfileId(profileId: string): Promise<Driver | null>;
  create(profileId: string, input: CreateDriverInput): Promise<Driver>;
  update(profileId: string, patch: DriverPatch): Promise<Driver>;
}

export function mapDriver(row: DriverRow): Driver {
  return {
    id: row.id,
    profileId: row.profile_id,
    fullName: row.full_name,
    operatorTypes: row.operator_types,
    cdlClass: row.cdl_class,
    endorsements: row.endorsements,
    yearsExperience: row.years_experience,
    city: row.city,
    state: row.state,
    zip: row.zip,
    serviceRadiusMiles: row.service_radius_miles,
    lat: row.lat,
    lng: row.lng,
    availability: row.availability,
    certifications: row.certifications,
    bio: row.bio,
    employmentType: row.employment_type,
    drivingStyles: row.driving_styles,
    transmission: row.transmission,
    equipmentTypes: row.equipment_types,
    twicActive: row.twic_active,
    medicalCardActive: row.medical_card_active,
    clearinghouseRegistered: row.clearinghouse_registered,
    mvrStatus: row.mvr_status,
    smsOptIn: row.sms_opt_in,
    smsOptInAt: row.sms_opt_in_at,
    smsOptInText: row.sms_opt_in_text,
    smsOptedOut: row.sms_opted_out,
    smsOptedOutAt: row.sms_opted_out_at,
    onboardingStep: row.onboarding_step,
    cardCompleted: row.card_completed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps only the keys present in the patch, so untouched columns keep their values. */
export function toDriverUpdate(patch: DriverPatch): DriverUpdate {
  const columns: { [K in keyof DriverPatch]-?: keyof DriverUpdate } = {
    fullName: "full_name",
    city: "city",
    state: "state",
    zip: "zip",
    serviceRadiusMiles: "service_radius_miles",
    lat: "lat",
    lng: "lng",
    operatorTypes: "operator_types",
    cdlClass: "cdl_class",
    endorsements: "endorsements",
    yearsExperience: "years_experience",
    certifications: "certifications",
    availability: "availability",
    bio: "bio",
    employmentType: "employment_type",
    drivingStyles: "driving_styles",
    transmission: "transmission",
    equipmentTypes: "equipment_types",
    twicActive: "twic_active",
    medicalCardActive: "medical_card_active",
    clearinghouseRegistered: "clearinghouse_registered",
    mvrStatus: "mvr_status",
    smsOptIn: "sms_opt_in",
    smsOptInAt: "sms_opt_in_at",
    smsOptInText: "sms_opt_in_text",
    onboardingStep: "onboarding_step",
    cardCompleted: "card_completed",
  };

  const update: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    const value = patch[key as keyof DriverPatch];
    if (value !== undefined) update[column] = value;
  }
  return update as DriverUpdate;
}

export class DriverRepository extends BaseRepository implements IDriverRepository {
  async findByProfileId(profileId: string): Promise<Driver | null> {
    const result = await this.supabase
      .from("drivers")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapDriver(row) : null;
  }

  async create(profileId: string, input: CreateDriverInput): Promise<Driver> {
    const result = await this.supabase
      .from("drivers")
      .insert({
        profile_id: profileId,
        full_name: input.fullName,
        onboarding_step: input.onboardingStep,
        ...(input.city !== undefined && { city: input.city }),
        ...(input.state !== undefined && { state: input.state }),
        ...(input.zip !== undefined && { zip: input.zip }),
        ...(input.serviceRadiusMiles !== undefined && {
          service_radius_miles: input.serviceRadiusMiles,
        }),
      })
      .select("*")
      .single();
    return mapDriver(this.unwrap(result));
  }

  async update(profileId: string, patch: DriverPatch): Promise<Driver> {
    const result = await this.supabase
      .from("drivers")
      .update(toDriverUpdate(patch))
      .eq("profile_id", profileId)
      .select("*")
      .single();
    return mapDriver(this.unwrap(result));
  }
}
