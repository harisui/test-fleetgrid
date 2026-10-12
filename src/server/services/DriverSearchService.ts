import { SEARCH_PAGE_SIZE, SIGNED_URL_TTL_SECONDS } from "@/lib/constants";
import { milesBetweenRounded } from "@/lib/geo";
import { driverIdSchema, driverSearchSchema, type DriverSearchInput } from "@/lib/validation/carrier.schema";
import { documentIdSchema } from "@/lib/validation/document.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IDocumentRepository } from "@/server/repositories/DocumentRepository";
import type { IDriverSearchRepository } from "@/server/repositories/DriverSearchRepository";
import type { CarrierService } from "@/server/services/CarrierService";
import type { Driver, DriverDocument, DriverMatch, LocatedCarrier } from "@/types/domain";

export interface DriverSearchPage {
  matches: DriverMatch[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** The filters as applied, with defaults filled in. */
  filters: DriverSearchInput;
}

export interface DriverView {
  driver: Driver;
  distanceMiles: number;
  documents: DriverDocument[];
}

/**
 * What a subscribed carrier can see of drivers: the search from their yard, one driver's
 * card with their papers, and short-lived links to the files. The database lists the same
 * cards under RLS, so a carrier without access gets nothing here either.
 */
export class DriverSearchService {
  constructor(
    private readonly carrierService: CarrierService,
    private readonly drivers: IDriverSearchRepository,
    private readonly documents: IDocumentRepository,
  ) {}

  async search(userId: string, input: unknown): Promise<DriverSearchPage> {
    const carrier = await this.requireSubscribedCarrier(userId);
    const filters = parseInput(driverSearchSchema, input);
    const { matches, total } = await this.drivers.search({
      lat: carrier.lat,
      lng: carrier.lng,
      radiusMiles: filters.radiusMiles,
      cdlClass: filters.cdlClass,
      endorsements: filters.endorsements,
      minYears: filters.minYears,
      twicActive: filters.twicActive,
      medicalCardActive: filters.medicalCardActive,
      manualOnly: filters.manualOnly,
      equipmentTypes: filters.equipmentTypes,
      mvrMax: filters.mvrMax,
      limit: SEARCH_PAGE_SIZE,
      offset: (filters.page - 1) * SEARCH_PAGE_SIZE,
    });
    return {
      matches,
      total,
      page: filters.page,
      pageSize: SEARCH_PAGE_SIZE,
      pageCount: Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE)),
      filters,
    };
  }

  /** One listed driver with the distance from the yard and the papers they uploaded. */
  async getDriver(userId: string, input: unknown): Promise<DriverView> {
    const carrier = await this.requireSubscribedCarrier(userId);
    const { driverId } = parseInput(driverIdSchema, input);
    const driver = await this.drivers.findById(driverId);
    // Not listed reads the same as not there.
    if (!driver || driver.lat === null || driver.lng === null) {
      throw AppError.notFound("Driver not found");
    }
    const documents = await this.documents.listByDriverId(driver.id);
    return {
      driver,
      distanceMiles: milesBetweenRounded(carrier.lat, carrier.lng, driver.lat, driver.lng),
      documents,
    };
  }

  /** A link to one of a listed driver's files. It expires after SIGNED_URL_TTL_SECONDS. */
  async getDocumentUrl(userId: string, input: unknown): Promise<string> {
    await this.requireSubscribedCarrier(userId);
    const { documentId } = parseInput(documentIdSchema, input);
    const document = await this.documents.findById(documentId);
    if (!document) throw AppError.notFound("Document not found");
    return this.documents.createSignedUrl(document.storagePath, SIGNED_URL_TTL_SECONDS);
  }

  private async requireSubscribedCarrier(userId: string): Promise<LocatedCarrier> {
    const access = await this.carrierService.getAccess(userId);
    if (!access.carrier) throw AppError.notFound("Save your company details first");
    if (!access.subscribed) throw AppError.forbidden("An active subscription is required");
    return access.carrier;
  }
}
