import { displayStatus, sendAfterFor } from "@/lib/shifts/schedule";
import { cancelledText } from "@/lib/shifts/texts";
import {
  cancelShiftSchema,
  SHIFT_START_PAST_MESSAGE,
  shiftIdSchema,
  shiftPostSchema,
} from "@/lib/validation/shift.schema";
import { ZIP_UNKNOWN_MESSAGE } from "@/lib/validation/onboarding.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IZipProvider } from "@/server/providers/ZipProvider";
import type { IBroadcastRepository } from "@/server/repositories/BroadcastRepository";
import type { IServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import type { IShiftRepository } from "@/server/repositories/ShiftRepository";
import type { ITextingDriverRepository } from "@/server/repositories/TextingDriverRepository";
import type { BroadcastResult, BroadcastService } from "@/server/services/BroadcastService";
import type { CarrierService } from "@/server/services/CarrierService";
import type { TextService } from "@/server/services/TextService";
import type {
  BookedDriverContact,
  BroadcastRecipient,
  LocatedCarrier,
  Shift,
  ShiftRequirements,
} from "@/types/domain";

export const SHIFT_OUTSIDE_AREA_MESSAGE = "This ZIP is outside the areas FleetGrid serves.";

/** What the carrier's shift page shows. */
export interface CarrierShiftDetail {
  shift: Shift;
  recipients: BroadcastRecipient[];
  /** The booked driver's name and phone, only while booked (2026-10-25). */
  bookedDriver: BookedDriverContact | null;
}

export interface PostedShift {
  shift: Shift;
  broadcast: BroadcastResult | null;
}

/** The service-role repositories, built on demand. */
export interface ShiftAdminRepositories {
  shifts: () => IShiftRepository;
  recipients: () => IBroadcastRepository;
  drivers: () => ITextingDriverRepository;
}

/**
 * Broadcast Shift for carriers and drivers (T3.3, T3.8, T3.10): posting with quiet hours,
 * the live count, the carrier's list and shift page, cancelling (with the notice to a booked
 * driver), releasing a no-show (the shift goes out again without them), and the driver's
 * My shifts. Only a subscribed carrier ("ready") posts.
 */
export class ShiftService {
  constructor(
    private readonly carriers: Pick<CarrierService, "getAccess">,
    private readonly shifts: IShiftRepository,
    private readonly recipients: IBroadcastRepository,
    private readonly admin: ShiftAdminRepositories,
    private readonly zips: IZipProvider,
    private readonly serviceAreas: IServiceAreaRepository,
    private readonly broadcasts: () => BroadcastService,
    private readonly texts: TextService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Posts the shift, then broadcasts it at once or holds it for 7 AM (quiet hours). */
  async postShift(userId: string, input: unknown): Promise<PostedShift> {
    const carrier = await this.requireReadyCarrier(userId);
    const values = parseInput(shiftPostSchema, input);
    const now = this.now();
    if (values.startsAt <= now) throw AppError.validation(undefined, { startTime: SHIFT_START_PAST_MESSAGE });
    const place = await this.placeFor(values.zip);
    const sendAfter = sendAfterFor(now, values.startsAt);

    const shift = await this.shifts.create(carrier.id, {
      ...place,
      zip: values.zip,
      startsAt: values.startsAt.toISOString(),
      endsAt: values.endsAt.toISOString(),
      cdlClass: values.cdlClass,
      endorsements: values.endorsements,
      minYears: values.minYears,
      equipmentTypes: values.equipmentTypes,
      twicRequired: values.twicRequired,
      medicalRequired: values.medicalRequired,
      manualRequired: values.manualRequired,
      payText: values.payText,
      workDescription: values.workDescription,
      onsiteContactName: values.onsiteContactName,
      onsiteContactPhone: values.onsiteContactPhone,
      sendAfter: sendAfter?.toISOString() ?? null,
    });
    if (sendAfter) return { shift, broadcast: null };
    const broadcast = await this.broadcasts().broadcast(shift.id, now);
    return { shift: (await this.shifts.findById(shift.id)) ?? shift, broadcast };
  }

  /** "N drivers match" while the form is filled in. Unknown or outside ZIPs count zero. */
  async countMatches(userId: string, input: { zip: string } & ShiftRequirements): Promise<number> {
    await this.requireReadyCarrier(userId);
    const place = this.zips.find(input.zip);
    if (!place || !(await this.serviceAreas.contains(place.lat, place.lng))) return 0;
    return this.broadcasts().countMatches(place, input);
  }

  async listCarrierShifts(userId: string): Promise<Shift[]> {
    const carrier = await this.requireReadyCarrier(userId);
    return this.shifts.list({ carrierId: carrier.id });
  }

  async getCarrierShift(userId: string, input: unknown): Promise<CarrierShiftDetail> {
    const shift = await this.requireOwnShift(userId, input);
    const [recipients, bookedDriver] = await Promise.all([
      this.recipients.listByShift(shift.id),
      shift.status === "booked" ? this.shifts.bookedDriverContact(shift.id) : Promise.resolve(null),
    ]);
    return { shift, recipients, bookedDriver };
  }

  /** Cancels an open or booked shift; a booked driver is told by text (decision 2). */
  async cancelShift(userId: string, input: unknown): Promise<Shift> {
    const { shiftId, reason } = parseInput(cancelShiftSchema, input);
    const shift = await this.requireOwnShift(userId, { shiftId });
    if (shift.status !== "open" && shift.status !== "booked") {
      throw AppError.conflict("This shift is no longer open or booked");
    }
    const cancelled = await this.admin.shifts().update(shift.id, {
      status: "cancelled",
      cancelledAt: this.now().toISOString(),
      cancelReason: reason,
      sendAfter: null,
    });
    if (shift.status === "booked" && shift.bookedDriverId) {
      const driver = await this.admin.drivers().findById(shift.bookedDriverId);
      if (driver) await this.texts.send(driver, "cancelled", cancelledText(shift), shift.id);
    }
    return cancelled;
  }

  /**
   * The booked driver did not show (2026-10-25): their no-show count goes up, the shift
   * reopens with a fresh code, and it goes out again without them.
   */
  async releaseShift(userId: string, input: unknown): Promise<PostedShift> {
    const shift = await this.requireOwnShift(userId, input);
    if (shift.status !== "booked") throw AppError.conflict("Only a booked shift can be released");
    const released = await this.admin.shifts().release(shift.id);
    if (!released) throw AppError.conflict("This shift can no longer be released");
    const broadcast = await this.broadcasts().broadcast(shift.id, this.now());
    return { shift: (await this.admin.shifts().findById(shift.id)) ?? shift, broadcast };
  }

  /** The driver's booked shifts (RLS: only their own), soonest first. */
  async listDriverShifts(driverId: string): Promise<Shift[]> {
    return this.shifts.listBookedByDriver(driverId);
  }

  /** The status to show, with open shifts past their time shown as expired. */
  statusOf(shift: Shift): Shift["status"] {
    return displayStatus(shift, this.now());
  }

  private async requireOwnShift(userId: string, input: unknown): Promise<Shift> {
    const carrier = await this.requireReadyCarrier(userId);
    const { shiftId } = parseInput(shiftIdSchema, input);
    const shift = await this.shifts.findById(shiftId);
    if (!shift || shift.carrierId !== carrier.id) throw AppError.notFound("Shift not found");
    return shift;
  }

  private async requireReadyCarrier(userId: string): Promise<LocatedCarrier> {
    const access = await this.carriers.getAccess(userId);
    if (access.stage !== "ready" || !access.carrier) {
      throw AppError.forbidden("Shifts need an active subscription");
    }
    return access.carrier;
  }

  private async placeFor(zip: string): Promise<{ city: string; state: string; lat: number; lng: number }> {
    const place = this.zips.find(zip);
    if (!place) throw AppError.validation(undefined, { zip: ZIP_UNKNOWN_MESSAGE });
    if (!(await this.serviceAreas.contains(place.lat, place.lng))) {
      throw AppError.validation(undefined, { zip: SHIFT_OUTSIDE_AREA_MESSAGE });
    }
    return { city: place.city, state: place.state, lat: place.lat, lng: place.lng };
  }
}
