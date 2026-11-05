import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type {
  CarrierDriverCard,
  CdlClass,
  DriverMatch,
  Endorsement,
  EquipmentType,
  MvrStatus,
} from "@/types/domain";

/** The search_drivers() arguments. Undefined means "no filter". */
export interface DriverSearchParams {
  lat: number;
  lng: number;
  radiusMiles: number;
  /** The lowest class that will do: B matches A and B. */
  cdlClass?: CdlClass;
  endorsements: Endorsement[];
  minYears?: number;
  twicActive?: boolean;
  medicalCardActive?: boolean;
  /** True: the driver must drive a manual. */
  manualOnly?: boolean;
  equipmentTypes: EquipmentType[];
  /** The worst record that will do. */
  mvrMax?: MvrStatus;
  limit: number;
  offset: number;
}

export interface DriverSearchResult {
  matches: DriverMatch[];
  total: number;
}

type CardRow = Database["public"]["Functions"]["carrier_driver_cards"]["Returns"][number];

function mapCard(row: CardRow): CarrierDriverCard {
  return {
    id: row.id,
    fullName: row.full_name,
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
    twicExpiresOn: row.twic_expires_on,
    medicalCardActive: row.medical_card_active,
    clearinghouseRegistered: row.clearinghouse_registered,
    mvrStatus: row.mvr_status,
    smsOptIn: row.sms_opt_in,
    smsOptedOut: row.sms_opted_out,
    rosterGraceUntil: row.roster_grace_until,
  };
}

/**
 * What a carrier can see of drivers. Every read goes through carrier_driver_cards() and
 * search_drivers() (0038), never the drivers table: a carrier without an active subscription gets
 * nothing, nobody gets a card that is not listed, and only the safe columns ever leave.
 */
export interface IDriverSearchRepository {
  search(params: DriverSearchParams): Promise<DriverSearchResult>;
  findById(driverId: string): Promise<CarrierDriverCard | null>;
}

export class DriverSearchRepository extends BaseRepository implements IDriverSearchRepository {
  async search(params: DriverSearchParams): Promise<DriverSearchResult> {
    const ranked = this.unwrap(
      await this.supabase.rpc("search_drivers", {
        p_lat: params.lat,
        p_lng: params.lng,
        p_radius_miles: params.radiusMiles,
        p_cdl_class: params.cdlClass,
        p_endorsements: params.endorsements,
        p_min_years: params.minYears,
        p_twic: params.twicActive,
        p_medical: params.medicalCardActive,
        p_manual: params.manualOnly,
        p_equipment: params.equipmentTypes,
        p_mvr_max: params.mvrMax,
        p_limit: params.limit,
        p_offset: params.offset,
      }),
    );
    if (ranked.length === 0) return { matches: [], total: 0 };

    const rows = this.unwrap(await this.supabase.rpc("carrier_driver_cards", { p_driver_ids: ranked.map((row) => row.driver_id) }));
    const byId = new Map(rows.map((row) => [row.id, mapCard(row)]));
    const matches: DriverMatch[] = [];
    for (const row of ranked) {
      const driver = byId.get(row.driver_id);
      if (driver) matches.push({ driver, distanceMiles: Number(row.distance_miles) });
    }
    return { matches, total: Number(ranked[0].total_count) };
  }

  async findById(driverId: string): Promise<CarrierDriverCard | null> {
    const [row] = this.unwrap(await this.supabase.rpc("carrier_driver_cards", { p_driver_ids: [driverId] }));
    return row ? mapCard(row) : null;
  }
}
