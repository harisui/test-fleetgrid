import type { IServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import type { ServiceArea } from "@/types/domain";

/** The launch areas as the seed has them, for tests that list them. */
export const FAKE_AREAS: ServiceArea[] = [
  { id: "area-houston", name: "Houston", centerZip: "77002", centerLat: 29.7594, centerLng: -95.3594, radiusMiles: 50, isActive: true },
  { id: "area-pasadena", name: "Pasadena", centerZip: "77506", centerLat: 29.7009, centerLng: -95.1989, radiusMiles: 50, isActive: true },
];

/**
 * In-memory stand-in for the service areas. `contains` decides with a predicate (everywhere
 * is in area by default); `listActive` returns the areas given, the launch pair by default.
 */
export class FakeServiceAreaRepository implements IServiceAreaRepository {
  readonly calls: { lat: number; lng: number }[] = [];
  areas: ServiceArea[] = FAKE_AREAS;

  constructor(private inside: (lat: number, lng: number) => boolean = () => true) {}

  /** Changes the answer for later calls, like an admin editing an area. */
  setAreas(inside: (lat: number, lng: number) => boolean): void {
    this.inside = inside;
  }

  async contains(lat: number, lng: number): Promise<boolean> {
    this.calls.push({ lat, lng });
    return this.inside(lat, lng);
  }

  async listActive(): Promise<ServiceArea[]> {
    return this.areas.filter((area) => area.isActive);
  }
}
