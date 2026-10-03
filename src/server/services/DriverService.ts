import { SMS_CONSENT_TEXT } from "@/lib/constants";
import {
  DONE_STEP_NUMBER,
  FIRST_STEP_NUMBER,
  isSavableStepId,
  nextStepId,
  stepByNumber,
  stepNumber,
  type SavableStepId,
  type StepId,
} from "@/lib/onboarding/steps";
import { driverCardSchema } from "@/lib/validation/driver.schema";
import {
  bioScreenSchema,
  cdlClassScreenSchemaFor,
  certificationsScreenSchema,
  consentScreenSchema,
  distanceScreenSchema,
  documentsScreenSchema,
  endorsementsScreenSchema,
  experienceScreenSchema,
  hasCdlConflict,
  nameScreenSchema,
  workTypeScreenSchema,
  availabilityScreenSchema,
  zipScreenSchema,
} from "@/lib/validation/onboarding.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { DriverPatch, IDriverRepository } from "@/server/repositories/DriverRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { Driver, Profile } from "@/types/domain";

export interface OnboardingState {
  /** The screen the driver should see next. "done" once the card is complete. */
  stepId: StepId;
  completed: boolean;
  driver: Driver | null;
}

/** Required card fields that are still missing, with the screen that collects them. */
export function missingCardFields(driver: Driver): { field: string; stepId: StepId }[] {
  const missing: { field: string; stepId: StepId }[] = [];
  if (!driver.state || !driver.zip) missing.push({ field: "zip", stepId: "zip" });
  if (driver.operatorTypes.length === 0)
    missing.push({ field: "operatorTypes", stepId: "workType" });
  if (driver.yearsExperience === null) {
    missing.push({ field: "yearsExperience", stepId: "experience" });
  }
  if (driver.availability.length === 0) {
    missing.push({ field: "availability", stepId: "availability" });
  }
  if (hasCdlConflict(driver.operatorTypes, driver.cdlClass)) {
    missing.push({ field: "cdlClass", stepId: "cdlClass" });
  }
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

  /** Where to resume onboarding. A driver without a card starts on the first screen. */
  async getOnboardingState(userId: string): Promise<OnboardingState> {
    const driver = await this.getCard(userId);
    if (!driver) {
      return { stepId: stepByNumber(FIRST_STEP_NUMBER).id, completed: false, driver: null };
    }
    return {
      stepId: stepByNumber(driver.onboardingStep).id,
      completed: driver.cardCompleted,
      driver,
    };
  }

  /**
   * Saves one onboarding screen. Each screen is validated and stored on its own, so the driver
   * can leave after any question and resume there. Screens cannot be skipped ahead. Going back
   * and saving an earlier screen again is allowed and never moves progress backwards.
   */
  async saveScreen(userId: string, stepId: unknown, input: unknown): Promise<Driver> {
    if (!isSavableStepId(stepId)) {
      throw AppError.validation("Unknown onboarding step");
    }
    await this.requireDriverProfile(userId);
    const existing = await this.drivers.findByProfileId(userId);

    if (stepId === "name") return this.saveName(userId, existing, input);

    if (!existing) throw AppError.validation("Start with the first step");
    if (stepNumber(stepId) > existing.onboardingStep) {
      throw AppError.validation("Finish the earlier steps first");
    }
    return this.saveLater(userId, existing, stepId, input);
  }

  /** Edits the whole card after onboarding (profile page). Consent and progress are untouched. */
  async updateCard(userId: string, input: unknown): Promise<Driver> {
    await this.requireDriverProfile(userId);
    const existing = await this.drivers.findByProfileId(userId);
    if (!existing) throw AppError.notFound("Complete onboarding first");

    const data = parseInput(driverCardSchema, input);
    if (hasCdlConflict(data.operatorTypes, data.cdlClass)) {
      throw AppError.validation("Check the form", { cdlClass: "CDL driver work needs a CDL" });
    }
    return this.drivers.update(userId, data);
  }

  private async saveName(userId: string, existing: Driver | null, input: unknown) {
    const data = parseInput(nameScreenSchema, input);
    const next = stepNumber(nextStepId("name", { cdlClass: existing?.cdlClass ?? null }));
    if (existing) {
      return this.drivers.update(userId, { ...data, ...this.advance(existing, next) });
    }
    try {
      return await this.drivers.create(userId, { ...data, onboardingStep: next });
    } catch (error) {
      // A double submit created the card a moment ago. Save over it instead of failing.
      if (error instanceof AppError && error.code === "CONFLICT") {
        const created = await this.drivers.findByProfileId(userId);
        if (created) {
          return this.drivers.update(userId, { ...data, ...this.advance(created, next) });
        }
      }
      throw error;
    }
  }

  private async saveLater(
    userId: string,
    existing: Driver,
    stepId: Exclude<SavableStepId, "name">,
    input: unknown,
  ): Promise<Driver> {
    const context = { cdlClass: existing.cdlClass };
    const advanceTo = (patch: DriverPatch, cdlClass = existing.cdlClass) => ({
      ...patch,
      ...this.advance(existing, stepNumber(nextStepId(stepId, { cdlClass }))),
    });

    switch (stepId) {
      case "zip":
        return this.drivers.update(userId, advanceTo(parseInput(zipScreenSchema, input)));
      case "distance":
        return this.drivers.update(userId, advanceTo(parseInput(distanceScreenSchema, input)));
      case "workType":
        return this.drivers.update(userId, advanceTo(parseInput(workTypeScreenSchema, input)));
      case "experience":
        return this.drivers.update(userId, advanceTo(parseInput(experienceScreenSchema, input)));
      case "availability":
        return this.drivers.update(userId, advanceTo(parseInput(availabilityScreenSchema, input)));
      case "cdlClass": {
        const data = parseInput(cdlClassScreenSchemaFor(existing.operatorTypes), input);
        // Without a CDL there are no endorsements, and that screen is skipped.
        const patch: DriverPatch = data.cdlClass === "none" ? { ...data, endorsements: [] } : data;
        return this.drivers.update(userId, advanceTo(patch, data.cdlClass));
      }
      case "endorsements": {
        const data = parseInput(endorsementsScreenSchema, input);
        const endorsements = context.cdlClass === "none" ? [] : data.endorsements;
        return this.drivers.update(userId, advanceTo({ endorsements }));
      }
      case "certifications":
        return this.drivers.update(
          userId,
          advanceTo(parseInput(certificationsScreenSchema, input)),
        );
      case "documents":
        // Papers are saved by DocumentService as they are uploaded. This only records progress.
        parseInput(documentsScreenSchema, input ?? {});
        return this.drivers.update(userId, advanceTo({}));
      case "bio":
        return this.drivers.update(userId, advanceTo(parseInput(bioScreenSchema, input)));
      case "consent":
        return this.saveConsent(userId, existing, input);
    }
  }

  private async saveConsent(userId: string, existing: Driver, input: unknown): Promise<Driver> {
    parseInput(consentScreenSchema, input);

    const missing = missingCardFields(existing);
    if (missing.length > 0) {
      throw AppError.validation(
        "Your card is missing required information. Go back and complete the earlier steps.",
        Object.fromEntries(missing.map(({ field }) => [field, "Required"])),
      );
    }

    const patch: DriverPatch = { onboardingStep: DONE_STEP_NUMBER, cardCompleted: true };
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
