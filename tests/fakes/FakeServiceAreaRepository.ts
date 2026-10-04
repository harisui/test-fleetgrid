import type { IServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";

/** In-memory stand-in for the service areas. Decides with a predicate; everywhere is in area by default. */
export class FakeServiceAreaRepository implements IServiceAreaRepository {
  readonly calls: { lat: number; lng: number }[] = [];

  constructor(private inside: (lat: number, lng: number) => boolean = () => true) {}

  /** Changes the answer for later calls, like an admin editing an area. */
  setAreas(inside: (lat: number, lng: number) => boolean): void {
    this.inside = inside;
  }

  async contains(lat: number, lng: number): Promise<boolean> {
    this.calls.push({ lat, lng });
    return this.inside(lat, lng);
  }
}
