import { normalizeZip } from "@/lib/validation/onboarding.schema";
import type { IZipProvider } from "@/server/providers/ZipProvider";
import type { IServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";

/** What the ZIP screen needs: the place to fill in, and whether the launch has reached it. */
export interface ZipLookup {
  zip: string;
  city: string;
  state: string;
  inServiceArea: boolean;
}

/** Turns whatever the driver typed into a city and state, or null when it is not a known ZIP. */
export class ZipLookupService {
  constructor(
    private readonly zips: IZipProvider,
    private readonly serviceAreas: IServiceAreaRepository,
  ) {}

  async lookup(input: unknown): Promise<ZipLookup | null> {
    const zip = normalizeZip(input);
    if (typeof zip !== "string" || !/^\d{5}$/.test(zip)) return null;
    const place = this.zips.find(zip);
    if (!place) return null;
    return {
      zip: place.zip,
      city: place.city,
      state: place.state,
      inServiceArea: await this.serviceAreas.contains(place.lat, place.lng),
    };
  }
}
