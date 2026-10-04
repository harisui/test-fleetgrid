import { BaseRepository } from "@/server/repositories/BaseRepository";

export interface IServiceAreaRepository {
  /** True when the point is inside at least one active service area, computed live. */
  contains(lat: number, lng: number): Promise<boolean>;
}

/**
 * The launch areas. The table itself is closed to signed-in users; the only question the app
 * asks is answered by the is_in_service_area() function, which any signed-in user may call.
 */
export class ServiceAreaRepository extends BaseRepository implements IServiceAreaRepository {
  async contains(lat: number, lng: number): Promise<boolean> {
    const result = await this.supabase.rpc("is_in_service_area", { lat, lng });
    return this.unwrap(result) === true;
  }
}
