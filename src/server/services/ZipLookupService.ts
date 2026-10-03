import { normalizeZip } from "@/lib/validation/onboarding.schema";
import type { IZipProvider, ZipPlace } from "@/server/providers/ZipProvider";

/** Turns whatever the driver typed into a city and state, or null when it is not a known ZIP. */
export class ZipLookupService {
  constructor(private readonly zips: IZipProvider) {}

  lookup(input: unknown): ZipPlace | null {
    const zip = normalizeZip(input);
    if (typeof zip !== "string" || !/^\d{5}$/.test(zip)) return null;
    return this.zips.find(zip);
  }
}
