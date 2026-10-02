import { ONBOARDING_STEPS, SMS_CONSENT_TEXT } from "@/lib/constants";
import {
  driverAvailabilitySchema,
  driverBasicsSchema,
  driverCardSchema,
  driverLicensesSchema,
  smsConsentSchema,
} from "@/lib/validation/driver.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { DriverPatch, IDriverRepository } from "@/server/repositories/DriverRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { Driver, Profile } from "@/types/domain";

/** Steps that accept a save. Step 6 is the done screen. */
export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

const SAVABLE_STEPS: readonly number[] = [1, 2, 3, 4, 5];

export interface OnboardingState {
  /** The step the driver should see next (1 to 6). */
  step: number;
  completed: boolean;
  driver: Driver | null;
}

/** Required card fields that are still missing, with the step that collects them. */
export function missingCardFields(driver: Driver): { field: string; step: number }[] {
  const missing: { field: string; step: number }[] = [];
  if (driver.operatorTypes.length === 0) missing.push({ field: "operatorTypes", step: 2 });
  if (driver.yearsExperience === null) missing.push({ field: "yearsExperience", step: 2 });
  if (driver.availability.length === 0) missing.push({ field: "availability", step: 3 });
  return missing;
}

export class DriverService {
  constructor(
    private readonly drivers: IDriverRepository,
    private readonly profiles: IProfileRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getCard(userId: string): Promise<Driver | null> {
    await this.requireDriverProfile(userId);
    return this.drivers.findByProfileId(userId);
  }

  /** Where to resume onboarding. A driver without a card starts at step 1. */
  async getOnboardingState(userId: string): Promise<OnboardingState> {
    const driver = await this.getCard(userId);
    if (!driver) return { step: ONBOARDING_STEPS.basics, completed: false, driver: null };
    return { step: driver.onboardingStep, completed: driver.cardCompleted, driver };
  }

  /**
   * Saves one onboarding step. Each step is validated and stored on its own, so the driver can
   * leave and resume. Steps cannot be skipped. Going back and saving an earlier step again is
   * allowed and never moves progress backwards.
   */
  async saveStep(userId: string, step: number, input: unknown): Promise<Driver> {
    if (!SAVABLE_STEPS.includes(step)) {
      throw AppError.validation("Unknown onboarding step");
    }
    await this.requireDriverProfile(userId);
    const existing = await this.drivers.findByProfileId(userId);

    if (step === ONBOARDING_STEPS.basics) {
      return this.saveBasics(userId, existing, input);
    }

    if (!existing) {
      throw AppError.validation("Start with the first step");
    }
    if (step > existing.onboardingStep) {
      throw AppError.validation("Finish the earlier steps first");
    }

    switch (step as OnboardingStep) {
      case ONBOARDING_STEPS.licenses: {
        const data = parseInput(driverLicensesSchema, input);
        return this.drivers.update(userId, { ...data, ...this.advance(existing, 3) });
      }
      case ONBOARDING_STEPS.availability: {
        const data = parseInput(driverAvailabilitySchema, input);
        return this.drivers.update(userId, { ...data, ...this.advance(existing, 4) });
      }
      case ONBOARDING_STEPS.documents:
        // Documents are optional and are saved by DocumentService. This only records progress.
        return this.drivers.update(userId, this.advance(existing, 5));
      default:
        return this.saveConsent(userId, existing, input);
    }
  }

  /** Edits the whole card after onboarding (profile page). Consent and progress are untouched. */
  async updateCard(userId: string, input: unknown): Promise<Driver> {
    await this.requireDriverProfile(userId);
    const existing = await this.drivers.findByProfileId(userId);
    if (!existing) throw AppError.notFound("Complete onboarding first");

    const data = parseInput(driverCardSchema, input);
    return this.drivers.update(userId, data);
  }

  private async saveBasics(userId: string, existing: Driver | null, input: unknown) {
    const data = parseInput(driverBasicsSchema, input);
    if (existing) {
      return this.drivers.update(userId, { ...data, ...this.advance(existing, 2) });
    }
    try {
      return await this.drivers.create(userId, { ...data, onboardingStep: 2 });
    } catch (error) {
      // A double submit created the card a moment ago. Save over it instead of failing.
      if (error instanceof AppError && error.code === "CONFLICT") {
        const created = await this.drivers.findByProfileId(userId);
        if (created) return this.drivers.update(userId, { ...data, ...this.advance(created, 2) });
      }
      throw error;
    }
  }

  private async saveConsent(userId: string, existing: Driver, input: unknown): Promise<Driver> {
    parseInput(smsConsentSchema, input);

    const missing = missingCardFields(existing);
    if (missing.length > 0) {
      throw AppError.validation(
        "Your card is missing required information. Go back and complete the earlier steps.",
        Object.fromEntries(missing.map(({ field }) => [field, "Required"])),
      );
    }

    const patch: DriverPatch = {
      onboardingStep: ONBOARDING_STEPS.done,
      cardCompleted: true,
    };
    // Keep the original consent record if the driver already agreed.
    if (!existing.smsOptIn) {
      patch.smsOptIn = true;
      patch.smsOptInAt = this.now().toISOString();
      patch.smsOptInText = SMS_CONSENT_TEXT;
    }
    return this.drivers.update(userId, patch);
  }

  /** Moves progress forward to `next`, never backwards. */
  private advance(existing: Driver, next: number): DriverPatch {
    return { onboardingStep: Math.max(existing.onboardingStep, next) };
  }

  private async requireDriverProfile(userId: string): Promise<Profile> {
    const profile = await this.profiles.findById(userId);
    if (!profile || profile.role !== "driver") {
      throw AppError.forbidden("Only drivers can do this");
    }
    if (profile.status === "blocked") {
      throw AppError.forbidden("Your account has been blocked. Contact support for help.");
    }
    return profile;
  }
}
