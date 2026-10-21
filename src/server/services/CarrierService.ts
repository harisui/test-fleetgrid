import { TOS_VERSION } from "@/lib/constants";
import { acceptTermsSchema, carrierDetailsSchema } from "@/lib/validation/carrier.schema";
import { ZIP_UNKNOWN_MESSAGE } from "@/lib/validation/onboarding.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IZipProvider } from "@/server/providers/ZipProvider";
import type { CarrierPatch, ICarrierRepository } from "@/server/repositories/CarrierRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { IServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import {
  isAccessStatus,
  type ISubscriptionRepository,
} from "@/server/repositories/SubscriptionRepository";
import type { ITosRepository } from "@/server/repositories/TosRepository";
import type { IWaitlistRepository } from "@/server/repositories/WaitlistRepository";
import type {
  Carrier,
  LocatedCarrier,
  Profile,
  Subscription,
  TosAcceptance,
  WaitlistEntry,
} from "@/types/domain";

/** Where a carrier is on the way to the search, in order. */
export type CarrierStage = "onboarding" | "terms" | "waitlist" | "billing" | "ready";

export const CARRIER_STAGE_PATHS: Record<CarrierStage, string> = {
  onboarding: "/carrier/onboarding",
  terms: "/carrier/terms",
  waitlist: "/carrier/waitlist",
  billing: "/carrier/billing",
  ready: "/carrier/search",
};

export interface CarrierAccess {
  carrier: LocatedCarrier | null;
  termsAccepted: boolean;
  /** The most recent subscription, whatever its status. Null before the first checkout. */
  subscription: Subscription | null;
  /** True while the subscription grants access (active or trialing). */
  subscribed: boolean;
  waitlisted: boolean;
  stage: CarrierStage;
}

export interface AcceptTermsContext {
  ip: string | null;
  userAgent: string | null;
}

/**
 * The carrier's own account: the company details, the Terms acceptance, the launch-area
 * check and the waitlist. Billing is SubscriptionService; searching is DriverSearchService.
 */
export class CarrierService {
  constructor(
    private readonly carriers: ICarrierRepository,
    private readonly profiles: IProfileRepository,
    private readonly zips: IZipProvider,
    private readonly serviceAreas: IServiceAreaRepository,
    private readonly tos: ITosRepository,
    private readonly waitlist: IWaitlistRepository,
    private readonly subscriptions: ISubscriptionRepository,
  ) {}

  async getCarrier(userId: string): Promise<LocatedCarrier | null> {
    await this.requireCarrierProfile(userId);
    const carrier = await this.carriers.findByProfileId(userId);
    return carrier ? this.locate(carrier) : null;
  }

  /** Everything the carrier pages need to decide what to show, and the stage to send the carrier to. */
  async getAccess(userId: string): Promise<CarrierAccess> {
    const carrier = await this.getCarrier(userId);
    if (!carrier) {
      return {
        carrier: null,
        termsAccepted: false,
        subscription: null,
        subscribed: false,
        waitlisted: false,
        stage: "onboarding",
      };
    }
    const [acceptance, active, current, entry] = await Promise.all([
      this.tos.findAcceptance(userId, TOS_VERSION),
      this.subscriptions.findActiveByCarrierId(carrier.id),
      this.subscriptions.findCurrentByCarrierId(carrier.id),
      this.waitlist.findByCarrierId(carrier.id),
    ]);
    const termsAccepted = acceptance !== null;
    // The same rule as the database (carrier_has_active_subscription): any subscription that
    // grants access does, whatever happened to an older one since. The one shown is the
    // access one, or else the latest.
    const subscription = active ?? current;
    const subscribed = active !== null && isAccessStatus(active.status);
    const stage: CarrierStage = !termsAccepted
      ? "terms"
      : subscribed
        ? "ready"
        : !carrier.inServiceArea
          ? "waitlist"
          : "billing";
    return {
      carrier,
      termsAccepted,
      subscription,
      subscribed,
      waitlisted: entry !== null,
      stage,
    };
  }

  /** The one-page carrier sign-up. Creating twice keeps the first row. */
  async createCarrier(userId: string, input: unknown): Promise<LocatedCarrier> {
    await this.requireCarrierProfile(userId);
    const existing = await this.carriers.findByProfileId(userId);
    if (existing) throw AppError.conflict("Your company details are already saved");

    const { zip, ...details } = parseInput(carrierDetailsSchema, input);
    const place = this.placeFor(zip);
    try {
      return await this.locate(await this.carriers.create(userId, { ...details, zip, ...place }));
    } catch (error) {
      if (error instanceof AppError && error.code === "CONFLICT") {
        const winner = await this.carriers.findByProfileId(userId);
        if (winner) return this.locate(winner);
      }
      throw error;
    }
  }

  /** Edits the company details from the account page. A new ZIP moves the yard. */
  async updateCarrier(userId: string, input: unknown): Promise<LocatedCarrier> {
    const carrier = await this.requireCarrier(userId);
    const { zip, ...details } = parseInput(carrierDetailsSchema, input);
    const patch: CarrierPatch = { ...details, zip, ...this.placeFor(zip) };
    return this.locate(await this.carriers.update(carrier.id, patch));
  }

  /** Records that the carrier accepted the current Terms, with where and how they did it. */
  async acceptTerms(
    userId: string,
    input: unknown,
    context: AcceptTermsContext,
  ): Promise<TosAcceptance> {
    await this.requireCarrier(userId);
    parseInput(acceptTermsSchema, input);
    return this.tos.record({
      profileId: userId,
      version: TOS_VERSION,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  /** A carrier outside every active area asks to be told when FleetGrid reaches them. */
  async joinWaitlist(userId: string): Promise<WaitlistEntry> {
    const carrier = await this.requireCarrier(userId);
    if (carrier.inServiceArea) {
      throw AppError.validation("FleetGrid is already available in your area");
    }
    return this.waitlist.create({
      carrierId: carrier.id,
      zip: carrier.zip,
      lat: carrier.lat,
      lng: carrier.lng,
    });
  }

  private placeFor(zip: string): { city: string; state: string; lat: number; lng: number } {
    const place = this.zips.find(zip);
    if (!place) throw AppError.validation(undefined, { zip: ZIP_UNKNOWN_MESSAGE });
    return { city: place.city, state: place.state, lat: place.lat, lng: place.lng };
  }

  private async locate(carrier: Carrier): Promise<LocatedCarrier> {
    return { ...carrier, inServiceArea: await this.serviceAreas.contains(carrier.lat, carrier.lng) };
  }

  private async requireCarrier(userId: string): Promise<LocatedCarrier> {
    const carrier = await this.getCarrier(userId);
    if (!carrier) throw AppError.notFound("Save your company details first");
    return carrier;
  }

  private async requireCarrierProfile(userId: string): Promise<Profile> {
    const profile = await this.profiles.findById(userId);
    if (!profile || profile.role !== "carrier") {
      throw AppError.forbidden("Only carriers can do this");
    }
    if (profile.status === "blocked") {
      throw AppError.forbidden("Your account has been blocked. Contact support for help.");
    }
    return profile;
  }
}
