import { SMS_CONSENT_TEXT, SMS_CONSENT_VERSION } from "@/lib/constants";
import {
  contextOf,
  DONE_STEP_NUMBER,
  FIRST_STEP_NUMBER,
  isSavableStepId,
  nextStepId,
  stepApplies,
  stepByNumber,
  stepNumber,
  type FlowContext,
  type SavableStepId,
  type StepId,
} from "@/lib/onboarding/steps";
import { driverCardSchema } from "@/lib/validation/driver.schema";
import {
  bioScreenSchema,
  cdlClassScreenSchemaFor,
  certificationsScreenSchema,
  complianceScreenSchema,
  consentScreenSchema,
  credentialsScreenSchema,
  distanceScreenSchema,
  documentsScreenSchema,
  drivingStyleScreenSchema,
  employmentTypeScreenSchema,
  endorsementsScreenSchema,
  equipmentScreenSchema,
  experienceScreenSchema,
  hasCdlConflict,
  nameScreenSchema,
  workTypeScreenSchema,
  availabilityScreenSchema,
  ZIP_UNKNOWN_MESSAGE,
  zipScreenSchema,
} from "@/lib/validation/onboarding.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IZipProvider } from "@/server/providers/ZipProvider";
import type { IConsentLogRepository } from "@/server/repositories/ConsentLogRepository";
import type { DriverPatch, IDriverRepository } from "@/server/repositories/DriverRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { IServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import { isCdlDriver, type Driver, type LocatedDriver, type Profile } from "@/types/domain";

export interface OnboardingState {
  /** The screen the driver should see next. "done" once the card is complete. */
  stepId: StepId;
  completed: boolean;
  driver: LocatedDriver | null;
}

/**
 * Required card fields that are still missing, with the screen that collects them, in flow
 * order. Driving style, transmission, equipment, Clearinghouse and MVR are required of CDL
 * drivers only; the database constraint `drivers_card_complete` says the same.
 */
export function missingCardFields(driver: Driver): { field: string; stepId: StepId }[] {
  const missing: { field: string; stepId: StepId }[] = [];
  const need = (isMissing: boolean, field: string, stepId: StepId) => {
    if (isMissing) missing.push({ field, stepId });
  };
  const cdl = isCdlDriver(driver.operatorTypes);
  need(!driver.state || !driver.zip, "zip", "zip");
  need(driver.operatorTypes.length === 0, "operatorTypes", "workType");
  need(driver.employmentType === null, "employmentType", "employmentType");
  need(cdl && driver.drivingStyles.length === 0, "drivingStyles", "drivingStyle");
  need(cdl && driver.equipmentTypes.length === 0, "equipmentTypes", "equipment");
  need(cdl && driver.transmission === null, "transmission", "equipment");
  need(driver.yearsExperience === null, "yearsExperience", "experience");
  need(driver.availability.length === 0, "availability", "availability");
  need(hasCdlConflict(driver.operatorTypes, driver.cdlClass), "cdlClass", "cdlClass");
  need(driver.twicActive === null, "twicActive", "credentials");
  need(driver.medicalCardActive === null, "medicalCardActive", "credentials");
  need(cdl && driver.clearinghouseRegistered === null, "clearinghouseRegistered", "compliance");
  need(cdl && driver.mvrStatus === null, "mvrStatus", "compliance");
  return missing;
}

export class DriverService {
  constructor(
    private readonly drivers: IDriverRepository,
    private readonly profiles: IProfileRepository,
    /** Bundled ZIP dataset, for the coordinates stored with a saved ZIP. */
    private readonly zips: IZipProvider,
    /** The launch areas, asked live whether the card's coordinates fall inside one. */
    private readonly serviceAreas: IServiceAreaRepository,
    /** The SMS consent audit log, built on demand because only the service role may write it. */
    private readonly consentLog: () => IConsentLogRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * The city, state and coordinates of a ZIP, from the bundled dataset. The client sends the
   * ZIP alone; a ZIP the dataset does not know is rejected (client decision of 2026-10-09).
   */
  private placeFor(zip: string): Pick<DriverPatch, "city" | "state" | "lat" | "lng"> {
    const place = this.zips.find(zip);
    if (!place) throw AppError.validation(undefined, { zip: ZIP_UNKNOWN_MESSAGE });
    return { city: place.city, state: place.state, lat: place.lat, lng: place.lng };
  }

  /** Adds the live answer to "is this card inside a launch area?". Unknown without coordinates. */
  private async locate(driver: Driver): Promise<LocatedDriver> {
    const inServiceArea =
      driver.lat === null || driver.lng === null
        ? null
        : await this.serviceAreas.contains(driver.lat, driver.lng);
    return { ...driver, inServiceArea };
  }

  async getCard(userId: string): Promise<LocatedDriver | null> {
    await this.requireDriverProfile(userId);
    const driver = await this.drivers.findByProfileId(userId);
    return driver ? this.locate(driver) : null;
  }

  /** Where to resume onboarding. A driver without a card starts on the first screen. */
  async getOnboardingState(userId: string): Promise<OnboardingState> {
    const driver = await this.getCard(userId);
    if (!driver) {
      return { stepId: stepByNumber(FIRST_STEP_NUMBER).id, completed: false, driver: null };
    }
    // Progress never moves backwards, so a driver who went back and dropped CDL work can be
    // parked on a CDL-only screen. Resume on the next screen that applies to them instead.
    const stored = stepByNumber(driver.onboardingStep).id;
    const context = contextOf(driver);
    return {
      stepId: stepApplies(stored, context) ? stored : nextStepId(stored, context),
      completed: driver.cardCompleted,
      driver,
    };
  }

  /**
   * Saves one onboarding screen. Each screen is validated and stored on its own, so the driver
   * can leave after any question and resume there. Screens cannot be skipped ahead. Going back
   * and saving an earlier screen again is allowed and never moves progress backwards.
   */
  async saveScreen(userId: string, stepId: unknown, input: unknown): Promise<LocatedDriver> {
    if (!isSavableStepId(stepId)) {
      throw AppError.validation("Unknown onboarding step");
    }
    await this.requireDriverProfile(userId);
    const existing = await this.drivers.findByProfileId(userId);

    if (stepId === "name") return this.locate(await this.saveName(userId, existing, input));

    if (!existing) throw AppError.validation("Start with the first step");
    if (stepNumber(stepId) > existing.onboardingStep) {
      throw AppError.validation("Finish the earlier steps first");
    }
    return this.locate(await this.saveLater(userId, existing, stepId, input));
  }

  /** Edits the whole card after onboarding (profile page). Consent and progress are untouched. */
  async updateCard(userId: string, input: unknown): Promise<LocatedDriver> {
    await this.requireDriverProfile(userId);
    const existing = await this.drivers.findByProfileId(userId);
    if (!existing) throw AppError.notFound("Complete onboarding first");

    const data = parseInput(driverCardSchema, input);
    if (hasCdlConflict(data.operatorTypes, data.cdlClass)) {
      throw AppError.validation("Check the form", { cdlClass: "CDL driver work needs a CDL" });
    }
    return this.locate(await this.drivers.update(userId, { ...data, ...this.placeFor(data.zip) }));
  }

  private async saveName(userId: string, existing: Driver | null, input: unknown) {
    const data = parseInput(nameScreenSchema, input);
    const next = stepNumber(nextStepId("name", contextOf(existing)));
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
    const context = contextOf(existing);
    // The next screen depends on the answer just given when it changes what applies: the
    // work type decides the CDL-only screens, the CDL class decides the endorsements screen.
    const advanceTo = (patch: DriverPatch, changed: Partial<FlowContext> = {}) => ({
      ...patch,
      ...this.advance(existing, stepNumber(nextStepId(stepId, { ...context, ...changed }))),
    });

    switch (stepId) {
      case "zip": {
        const data = parseInput(zipScreenSchema, input);
        return this.drivers.update(userId, advanceTo({ ...data, ...this.placeFor(data.zip) }));
      }
      case "distance":
        return this.drivers.update(userId, advanceTo(parseInput(distanceScreenSchema, input)));
      case "workType": {
        const data = parseInput(workTypeScreenSchema, input);
        return this.drivers.update(userId, advanceTo(data, { operatorTypes: data.operatorTypes }));
      }
      case "employmentType":
        return this.drivers.update(
          userId,
          advanceTo(parseInput(employmentTypeScreenSchema, input)),
        );
      case "drivingStyle":
        return this.drivers.update(userId, advanceTo(parseInput(drivingStyleScreenSchema, input)));
      case "equipment":
        return this.drivers.update(userId, advanceTo(parseInput(equipmentScreenSchema, input)));
      case "experience":
        return this.drivers.update(userId, advanceTo(parseInput(experienceScreenSchema, input)));
      case "availability":
        return this.drivers.update(userId, advanceTo(parseInput(availabilityScreenSchema, input)));
      case "cdlClass": {
        const data = parseInput(cdlClassScreenSchemaFor(existing.operatorTypes), input);
        // Without a CDL there are no endorsements, and that screen is skipped.
        const patch: DriverPatch = data.cdlClass === "none" ? { ...data, endorsements: [] } : data;
        return this.drivers.update(userId, advanceTo(patch, { cdlClass: data.cdlClass }));
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
      case "credentials":
        return this.drivers.update(userId, advanceTo(parseInput(credentialsScreenSchema, input)));
      case "documents":
        // Papers are saved by DocumentService as they are uploaded. This only records progress.
        parseInput(documentsScreenSchema, input ?? {});
        return this.drivers.update(userId, advanceTo({}));
      case "compliance":
        return this.drivers.update(userId, advanceTo(parseInput(complianceScreenSchema, input)));
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
      // The audit row goes first: proof of consent must exist before anything relies on it.
      const profile = await this.profiles.findById(userId);
      if (!profile) throw AppError.forbidden("Only drivers can do this");
      await this.consentLog().record({
        phone: profile.phone,
        event: "opt_in",
        consentText: SMS_CONSENT_TEXT,
        consentVersion: SMS_CONSENT_VERSION,
        source: "onboarding",
      });
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
