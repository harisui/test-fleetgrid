import { milesBetweenRounded } from "@/lib/geo";
import type {
  DriverSearchParams,
  DriverSearchResult,
  IDriverSearchRepository,
} from "@/server/repositories/DriverSearchRepository";
import type { Driver } from "@/types/domain";

/**
 * In-memory stand-in for DriverSearchRepository. Holds the cards a carrier may see (the
 * database decides that with RLS; here the test decides) and applies the same filters as
 * search_drivers(), in the same order.
 */
export class FakeDriverSearchRepository implements IDriverSearchRepository {
  readonly listed = new Map<string, Driver>();
  readonly searches: DriverSearchParams[] = [];

  constructor(seed: Driver[] = []) {
    for (const driver of seed) this.listed.set(driver.id, driver);
  }

  async search(params: DriverSearchParams): Promise<DriverSearchResult> {
    this.searches.push(params);
    const classRank = { A: 0, B: 1, none: 2 } as const;
    const mvrRank = { clean: 0, minor_1_2: 1, major_3_plus: 2 } as const;
    const all = [...this.listed.values()]
      .filter((driver) => driver.lat !== null && driver.lng !== null)
      .map((driver) => ({
        driver,
        distanceMiles: milesBetweenRounded(params.lat, params.lng, driver.lat!, driver.lng!),
      }))
      .filter(({ driver, distanceMiles }) => {
        if (distanceMiles > params.radiusMiles) return false;
        if (params.cdlClass && classRank[driver.cdlClass] > classRank[params.cdlClass]) {
          return false;
        }
        if (!params.endorsements.every((letter) => driver.endorsements.includes(letter))) {
          return false;
        }
        if (params.minYears !== undefined && (driver.yearsExperience ?? -1) < params.minYears) {
          return false;
        }
        if (params.twicActive !== undefined && driver.twicActive !== params.twicActive) {
          return false;
        }
        if (
          params.medicalCardActive !== undefined &&
          driver.medicalCardActive !== params.medicalCardActive
        ) {
          return false;
        }
        if (params.manualOnly === true && driver.transmission !== "manual_ok") return false;
        if (!params.equipmentTypes.every((kind) => driver.equipmentTypes.includes(kind))) {
          return false;
        }
        if (
          params.mvrMax &&
          (driver.mvrStatus === null || mvrRank[driver.mvrStatus] > mvrRank[params.mvrMax])
        ) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) => a.distanceMiles - b.distanceMiles || a.driver.id.localeCompare(b.driver.id),
      );
    return {
      matches: all.slice(params.offset, params.offset + params.limit),
      total: all.length,
    };
  }

  async findById(driverId: string): Promise<Driver | null> {
    return this.listed.get(driverId) ?? null;
  }
}
