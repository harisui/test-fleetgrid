import { SMS_CONSENT_TEXT, SMS_CONSENT_VERSION } from "@/lib/constants";
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
  consentScreenSchema,
  credentialsScreenSchema,
  distanceScreenSchema,
  endorsementsScreenSchema,
  equipmentScreenSchema,
  experienceScreenSchema,
  clearinghouseScreenSchema,
  heardFromScreenSchema,
  leadScreenSchema,
  recordScreenSchema,
  smsConsentSchema,
  transmissionScreenSchema,
  ZIP_UNKNOWN_MESSAGE,
} from "@/lib/validation/onboarding.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IZipProvider } from "@/server/providers/ZipProvider";
import type { IConsentLogRepository } from "@/server/repositories/ConsentLogRepository";
import type { DriverPatch, IDriverRepository } from "@/server/repositories/DriverRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { IServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import { CDL_WORK_TYPE, type Driver, type LocatedDriver, type Profile } from "@/types/domain";

export interface OnboardingState {
  /** The screen the driver should see next. "done" once the card is complete. */
  stepId: StepId;
  completed: boolean;
  driver: LocatedDriver | null;
}

/**
 * Required card fields that are still missing, with the screen that collects them, in flow
 * order. The database constraint `drivers_card_complete` says the same.
 */
export function missingCardFields(driver: Driver): { field: string; stepId: StepId }[] {
  const missing: { field: string; stepId: StepId }[] = [];
  const need = (isMissing: boolean, field: string, stepId: StepId) => {
    if (isMissing) missing.push({ field, stepId });
  };
  need(!driver.state || !driver.zip, "zip", "lead");
  need(driver.cdlClass === "none", "cdlClass", "lead");
  need(driver.yearsExperience === null, "yearsExperience", "experience");
  need(driver.mvrStatus === null, "mvrStatus", "record");
  need(driver.twicActive === null, "twicActive", "credentials");
  need(driver.medicalCardActive === null, "medicalCardActive", "credentials");
  need(driver.transmission === null, "transmission", "transmission");
  need(driver.equipmentTypes.length === 0, "equipmentTypes", "equipment");
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
    return {
      stepId: stepByNumber(driver.onboardingStep).id,
      completed: driver.cardCompleted,
      driver,
    };
  }

  /**
   * Saves one onboarding screen. Each screen is validated and stored on its own, so the driver
   * can leave after any page and resume there. Screens cannot be skipped ahead. Going back
   * and saving an earlier screen again is allowed and never moves progress backwards.
   */
  async saveScreen(userId: string, stepId: unknown, input: unknown): Promise<LocatedDriver> {
    if (!isSavableStepId(stepId)) {
      throw AppError.validation("Unknown onboarding step");
    }
    await this.requireDriverProfile(userId);
    const existing = await this.drivers.findByProfileId(userId);

    if (stepId === "lead") return this.locate(await this.saveLead(userId, existing, input));

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
    return this.locate(await this.drivers.update(userId, { ...data, ...this.placeFor(data.zip) }));
  }

  /**
   * The lead (brief of 2026-10-28): the name, the ZIP with its place, the CDL class and the
   * optional shift-text box. The card is created at once, unfinished; a ticked box records
   * the opt-in before the card exists, so proof of consent never trails the data.
   */
  private async saveLead(userId: string, existing: Driver | null, input: unknown) {
    const { consent, ...data } = parseInput(leadScreenSchema, input);
    const place = this.placeFor(data.zip);
    const next = stepNumber(nextStepId("lead"));
    const consentFields = await this.consentPatch(userId, existing ?? { smsOptIn: false }, consent, "onboarding");
    if (existing) {
      return this.drivers.update(userId, { ...data, ...place, ...consentFields, ...this.advance(existing, next) });
    }
    try {
      // FleetGrid lists CDL drivers only at launch (client decision of 2026-10-09), so the
      // work type is set here, not asked.
      return await this.drivers.create(userId, {
        ...data,
        ...place,
        ...consentFields,
        operatorTypes: [CDL_WORK_TYPE],
        onboardingStep: next,
      });
    } catch (error) {
      // A double submit created the card a moment ago. Save over it instead of failing.
      if (error instanceof AppError && error.code === "CONFLICT") {
        const created = await this.drivers.findByProfileId(userId);
        if (created) {
          return this.drivers.update(userId, { ...data, ...place, ...consentFields, ...this.advance(created, next) });
        }
      }
      throw error;
    }
  }

  private async saveLater(
    userId: string,
    existing: Driver,
    stepId: Exclude<SavableStepId, "lead">,
    input: unknown,
  ): Promise<Driver> {
    const advanceTo = (patch: DriverPatch) => ({
      ...patch,
      ...this.advance(existing, stepNumber(nextStepId(stepId))),
    });

    switch (stepId) {
      case "distance":
        return this.drivers.update(userId, advanceTo(parseInput(distanceScreenSchema, input)));
      case "experience":
        return this.drivers.update(userId, advanceTo(parseInput(experienceScreenSchema, input)));
      case "record":
        return this.drivers.update(userId, advanceTo(parseInput(recordScreenSchema, input)));
      case "clearinghouse": {
        // Optional: a tick is a yes with the database's time, anything else clears it.
        const { clearinghouseConfirmed } = parseInput(clearinghouseScreenSchema, input);
        await this.drivers.setClearinghouseSelfReport(existing.id, clearinghouseConfirmed);
        return this.drivers.update(userId, advanceTo({}));
      }
      case "credentials":
        return this.drivers.update(userId, advanceTo(parseInput(credentialsScreenSchema, input)));
      case "endorsements":
        return this.drivers.update(userId, advanceTo(parseInput(endorsementsScreenSchema, input)));
      case "transmission":
        return this.drivers.update(
          userId,
          advanceTo(parseInput(transmissionScreenSchema, input)),
        );
      case "equipment":
        return this.drivers.update(userId, advanceTo(parseInput(equipmentScreenSchema, input)));
      case "heardFrom": {
        const data = parseInput(heardFromScreenSchema, input);
        // A driver who ticked the box on the lead is not asked again: this is their last
        // screen, and the card completes here.
        if (existing.smsOptIn) return this.completeCard(userId, existing, data);
        return this.drivers.update(userId, advanceTo(data));
      }
      case "consent":
        return this.saveConsent(userId, existing, input);
    }
  }

  /**
   * The last screen for a driver who left the box empty on the lead. The card completes
   * whether or not the box is ticked now: shift texts are optional, never a condition of
   * signing up (Twilio). A ticked box records the opt-in; an unticked box after an earlier
   * opt-in records the opt-out.
   */
  private async saveConsent(userId: string, existing: Driver, input: unknown): Promise<Driver> {
    const { consent } = parseInput(consentScreenSchema, input);
    return this.completeCard(userId, existing, await this.consentPatch(userId, existing, consent, "onboarding"));
  }

  /** Marks the card finished with `patch`, once every required answer is there. */
  private async completeCard(userId: string, existing: Driver, patch: DriverPatch): Promise<Driver> {
    const missing = missingCardFields(existing);
    if (missing.length > 0) {
      throw AppError.validation(
        "Your card is missing required information. Go back and complete the earlier steps.",
        Object.fromEntries(missing.map(({ field }) => [field, "Required"])),
      );
    }
    return this.drivers.update(userId, { ...patch, onboardingStep: DONE_STEP_NUMBER, cardCompleted: true });
  }

  /**
   * The profile page's "Clearinghouse and SAP" box: ticked saves a yes with a new time,
   * unticked deletes the answer and its date. Never touches progress or completion.
   */
  async setClearinghouseSelfReport(userId: string, input: unknown): Promise<LocatedDriver> {
    const { clearinghouseConfirmed } = parseInput(clearinghouseScreenSchema, input);
    await this.requireDriverProfile(userId);
    const existing = await this.drivers.findByProfileId(userId);
    if (!existing) throw AppError.validation("Start with the first step");
    await this.drivers.setClearinghouseSelfReport(existing.id, clearinghouseConfirmed);
    const updated = await this.drivers.findByProfileId(userId);
    return this.locate(updated ?? existing);
  }

  /** Turns shift texts on or off from the profile page. A STOP reply can only be undone by START. */
  async setSmsConsent(userId: string, input: unknown): Promise<LocatedDriver> {
    const { consent } = parseInput(smsConsentSchema, input);
    await this.requireDriverProfile(userId);
    const existing = await this.drivers.findByProfileId(userId);
    if (!existing) throw AppError.validation("Start with the first step");
    if (consent && existing.smsOptedOut) {
      throw AppError.validation(
        "You replied STOP, so texts can only be turned back on by replying START to the FleetGrid number.",
      );
    }
    const patch = await this.consentPatch(userId, existing, consent, "profile");
    return this.locate(
      Object.keys(patch).length > 0 ? await this.drivers.update(userId, patch) : existing,
    );
  }

  /**
   * The columns that change when the answer differs from what is on record, with the audit
   * row written first: proof of consent must exist before anything relies on it. The
   * original opt-in record is kept when the driver agrees again.
   */
  private async consentPatch(
    userId: string,
    existing: Pick<Driver, "smsOptIn">,
    consent: boolean,
    source: "onboarding" | "profile",
  ): Promise<DriverPatch> {
    if (consent === existing.smsOptIn) return {};
    const profile = await this.profiles.findById(userId);
    if (!profile) throw AppError.forbidden("Only drivers can do this");
    await this.consentLog().record({
      phone: profile.phone,
      event: consent ? "opt_in" : "opt_out",
      consentText: SMS_CONSENT_TEXT,
      consentVersion: SMS_CONSENT_VERSION,
      source,
    });
    return consent
      ? { smsOptIn: true, smsOptInAt: this.now().toISOString(), smsOptInText: SMS_CONSENT_TEXT }
      : { smsOptIn: false, smsOptInAt: null, smsOptInText: null };
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
