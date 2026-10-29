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
  HeardFrom,
  MvrStatus,
  OperatorType,
  TransmissionType,
} from "@/types/domain";

type DriverRow = Database["public"]["Tables"]["drivers"]["Row"];
type DriverUpdate = Database["public"]["Tables"]["drivers"]["Update"];

/**
 * Fields needed to create the card on the first onboarding screen: the lead's name, ZIP with
 * its place, CDL class and, when the box was ticked, the consent record.
 */
export interface CreateDriverInput {
  fullName: string;
  onboardingStep: number;
  operatorTypes?: OperatorType[];
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
  cdlClass?: CdlClass;
  serviceRadiusMiles?: number;
  smsOptIn?: boolean;
  smsOptInAt?: string | null;
  smsOptInText?: string | null;
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
  smsOptInAt?: string | null;
  smsOptInText?: string | null;
  heardFrom?: HeardFrom | null;
  heardFromOther?: string | null;
  onboardingStep?: number;
  cardCompleted?: boolean;
}

export interface IDriverRepository {
  findByProfileId(profileId: string): Promise<Driver | null>;
  create(profileId: string, input: CreateDriverInput): Promise<Driver>;
  update(profileId: string, patch: DriverPatch): Promise<Driver>;
  /**
   * The self-reported Clearinghouse and SAP answer (0021): true writes a yes with the
   * database's time (a new time when confirmed again), false deletes the answer and its date.
   */
  setClearinghouseSelfReport(driverId: string, confirmed: boolean): Promise<void>;
}

/** The card plus, for the driver and admins, the self-reported answer (0021). */
export const DRIVER_SELECT = "*, driver_clearinghouse_self_reports(confirmed_at)";

type SelfReportEmbed = { confirmed_at: string } | { confirmed_at: string }[] | null | undefined;

/** The embedded answer's time, one-to-one or as a list depending on the client's reading of the key. */
function selfReportedAt(embed: SelfReportEmbed): string | null {
  if (!embed) return null;
  const report = Array.isArray(embed) ? embed[0] : embed;
  return report?.confirmed_at ?? null;
}

export function mapDriver(row: DriverRow & { driver_clearinghouse_self_reports?: SelfReportEmbed }): Driver {
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
    heardFrom: row.heard_from,
    heardFromOther: row.heard_from_other,
    clearinghouseSelfReportedAt: selfReportedAt(row.driver_clearinghouse_self_reports),
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
    heardFrom: "heard_from",
    heardFromOther: "heard_from_other",
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
      .select(DRIVER_SELECT)
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
        ...(input.operatorTypes !== undefined && { operator_types: input.operatorTypes }),
        ...(input.city !== undefined && { city: input.city }),
        ...(input.state !== undefined && { state: input.state }),
        ...(input.zip !== undefined && { zip: input.zip }),
        ...(input.lat !== undefined && { lat: input.lat }),
        ...(input.lng !== undefined && { lng: input.lng }),
        ...(input.cdlClass !== undefined && { cdl_class: input.cdlClass }),
        ...(input.serviceRadiusMiles !== undefined && {
          service_radius_miles: input.serviceRadiusMiles,
        }),
        ...(input.smsOptIn !== undefined && { sms_opt_in: input.smsOptIn }),
        ...(input.smsOptInAt !== undefined && { sms_opt_in_at: input.smsOptInAt }),
        ...(input.smsOptInText !== undefined && { sms_opt_in_text: input.smsOptInText }),
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
      .select(DRIVER_SELECT)
      .single();
    return mapDriver(this.unwrap(result));
  }

  async setClearinghouseSelfReport(driverId: string, confirmed: boolean): Promise<void> {
    const table = this.supabase.from("driver_clearinghouse_self_reports");
    // The time is stamped by the database (0021), so a fresh yes always carries a fresh time.
    const result = confirmed
      ? await table.upsert({ driver_id: driverId }, { onConflict: "driver_id" })
      : await table.delete().eq("driver_id", driverId);
    if (result.error) this.unwrap(result);
  }
}
