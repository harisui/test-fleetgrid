import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { ServiceArea } from "@/types/domain";

type ServiceAreaRow = Database["public"]["Tables"]["service_areas"]["Row"];

export interface IServiceAreaRepository {
  /** True when the point is inside at least one active service area, computed live. */
  contains(lat: number, lng: number): Promise<boolean>;
  /** The active areas, for the admin, who answers "inside?" for many cards at once. */
  listActive(): Promise<ServiceArea[]>;
}

export function mapServiceArea(row: ServiceAreaRow): ServiceArea {
  return {
    id: row.id,
    name: row.name,
    centerZip: row.center_zip,
    centerLat: Number(row.center_lat),
    centerLng: Number(row.center_lng),
    radiusMiles: row.radius_miles,
    isActive: row.is_active,
  };
}

/**
 * The launch areas. The table is closed to drivers and carriers; they get the one answer
 * through is_in_service_area(). Admins read the rows (0017) so the Drivers page can mark
 * every card in one pass with the same haversine (src/lib/geo.ts).
 */
export class ServiceAreaRepository extends BaseRepository implements IServiceAreaRepository {
  async contains(lat: number, lng: number): Promise<boolean> {
    const result = await this.supabase.rpc("is_in_service_area", { lat, lng });
    return this.unwrap(result) === true;
  }

  async listActive(): Promise<ServiceArea[]> {
    const result = await this.supabase
      .from("service_areas")
      .select("*")
      .eq("is_active", true)
      .order("name");
    return this.unwrap(result).map(mapServiceArea);
  }
}
