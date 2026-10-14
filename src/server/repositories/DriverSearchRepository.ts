import { BaseRepository } from "@/server/repositories/BaseRepository";
import { mapDriver } from "@/server/repositories/DriverRepository";
import type {
  CdlClass,
  Driver,
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

/**
 * What a carrier can see of drivers. Every read goes through the drivers table under RLS,
 * so a carrier without an active subscription gets nothing, and nobody gets a card that is
 * not listed.
 */
export interface IDriverSearchRepository {
  search(params: DriverSearchParams): Promise<DriverSearchResult>;
  findById(driverId: string): Promise<Driver | null>;
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

    const rows = this.unwrap(
      await this.supabase
        .from("drivers")
        .select("*")
        .in(
          "id",
          ranked.map((row) => row.driver_id),
        ),
    );
    const byId = new Map(rows.map((row) => [row.id, mapDriver(row)]));
    const matches: DriverMatch[] = [];
    for (const row of ranked) {
      const driver = byId.get(row.driver_id);
      if (driver) matches.push({ driver, distanceMiles: Number(row.distance_miles) });
    }
    return { matches, total: Number(ranked[0].total_count) };
  }

  async findById(driverId: string): Promise<Driver | null> {
    const result = await this.supabase.from("drivers").select("*").eq("id", driverId).maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapDriver(row) : null;
  }
}
