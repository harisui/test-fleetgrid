// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { SMS_CONSENT_TEXT } from "@/lib/constants";
import { SAVABLE_STEP_IDS, stepNumber, type SavableStepId } from "@/lib/onboarding/steps";
import {
  CDL_CONFLICT_MESSAGE,
  CLEARINGHOUSE_MESSAGE,
  DRIVING_STYLE_MESSAGE,
  EMPLOYMENT_MESSAGE,
  EQUIPMENT_MESSAGE,
  MEDICAL_CARD_MESSAGE,
  MVR_MESSAGE,
  TRANSMISSION_MESSAGE,
  TWIC_MESSAGE,
} from "@/lib/validation/onboarding.schema";
import { AppError } from "@/server/errors/AppError";
import { DriverService, missingCardFields } from "@/server/services/DriverService";
import type { LocatedDriver } from "@/types/domain";
import { FakeConsentLogRepository } from "../../fakes/FakeConsentLogRepository";
import { FakeDriverRepository } from "../../fakes/FakeDriverRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import { FakeServiceAreaRepository } from "../../fakes/FakeServiceAreaRepository";
import { FakeZipProvider } from "../../fakes/FakeZipProvider";
import {
  buildDriver,
  buildPartialDriver,
  buildProfile,
  OTHER_USER_ID,
  SCREEN_INPUTS,
  USER_ID,
  validCard,
} from "../../setup/factories";

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const NOW = new Date("2026-10-05T15:30:00.000Z");

/** The CDL-only answers, unanswered. */
const NO_CDL_CHECKS: Pick<
  LocatedDriver,
  "drivingStyles" | "transmission" | "equipmentTypes" | "clearinghouseRegistered" | "mvrClean3Years"
> = {
  drivingStyles: [],
  transmission: null,
  equipmentTypes: [],
  clearinghouseRegistered: null,
  mvrClean3Years: null,
};

describe("DriverService", () => {
  let drivers: FakeDriverRepository;
  let profiles: FakeProfileRepository;
  let zips: FakeZipProvider;
  let areas: FakeServiceAreaRepository;
  let consentLog: FakeConsentLogRepository;
  let logBuilt: number;
  let service: DriverService;

  beforeEach(() => {
    drivers = new FakeDriverRepository();
    profiles = new FakeProfileRepository([buildProfile()]);
    zips = new FakeZipProvider([
      { zip: "75201", city: "Dallas", state: "TX", lat: 32.78111, lng: -96.79722 },
      { zip: "60601", city: "Chicago", state: "IL", lat: 41.8858, lng: -87.6181 },
    ]);
    areas = new FakeServiceAreaRepository();
    consentLog = new FakeConsentLogRepository();
    logBuilt = 0;
    service = new DriverService(
      drivers,
      profiles,
      zips,
      areas,
      () => {
        logBuilt += 1;
        return consentLog;
      },
      () => NOW,
    );
  });

  /** Saves every screen up to and including `upTo` with valid input (a CDL driver). */
  async function completeThrough(upTo: SavableStepId) {
    for (const stepId of SAVABLE_STEP_IDS) {
      await service.saveScreen(USER_ID, stepId, SCREEN_INPUTS[stepId]);
      if (stepId === upTo) return;
    }
  }

  const card = () => drivers.rows.get(USER_ID)!;

  describe("authorization", () => {
    it.each([
      ["a carrier", buildProfile({ role: "carrier" })],
      ["an admin", buildProfile({ role: "admin" })],
    ])("rejects %s on every method", async (_label, profile) => {
      profiles.rows.set(USER_ID, profile);
      for (const call of [
        service.getCard(USER_ID),
        service.getOnboardingState(USER_ID),
        service.saveScreen(USER_ID, "name", SCREEN_INPUTS.name),
        service.updateCard(USER_ID, validCard()),
      ]) {
        expect((await expectAppError(call)).code).toBe("FORBIDDEN");
      }
      expect(drivers.rows.size).toBe(0);
    });

    it("rejects a user without a profile", async () => {
      const error = await expectAppError(
        service.saveScreen(OTHER_USER_ID, "name", SCREEN_INPUTS.name),
      );
      expect(error.code).toBe("FORBIDDEN");
    });

    it("rejects a blocked driver", async () => {
      profiles.rows.set(USER_ID, buildProfile({ status: "blocked" }));
      const error = await expectAppError(service.saveScreen(USER_ID, "name", SCREEN_INPUTS.name));
      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).toMatch(/blocked/);
    });

    it("only ever touches the caller's own card", async () => {
      profiles.rows.set(OTHER_USER_ID, buildProfile({ id: OTHER_USER_ID, phone: "+15555550103" }));
      const other = buildDriver({ profileId: OTHER_USER_ID, fullName: "Other Driver" });
      drivers.rows.set(OTHER_USER_ID, other);

      await completeThrough("consent");
      await service.updateCard(USER_ID, validCard({ fullName: "Changed Name" }));

      expect(drivers.rows.get(OTHER_USER_ID)).toEqual(other);
      await expect(service.getCard(OTHER_USER_ID)).resolves.toEqual(other);
    });
  });

  describe("getOnboardingState", () => {
    it("a new driver has no card and starts on the name screen", async () => {
      await expect(service.getCard(USER_ID)).resolves.toBeNull();
      await expect(service.getOnboardingState(USER_ID)).resolves.toEqual({
        stepId: "name",
        completed: false,
        driver: null,
      });
    });

    it.each(SAVABLE_STEP_IDS.slice(0, -1).map((id, index) => [id, SAVABLE_STEP_IDS[index + 1]]))(
      "after saving %s a CDL driver resumes on %s",
      async (saved, next) => {
        await completeThrough(saved);
        const state = await service.getOnboardingState(USER_ID);
        expect(state.stepId).toBe(next);
        expect(state.completed).toBe(false);
        expect(state.driver).not.toBeNull();
      },
    );

    it("after consent the card is complete and the driver sees the done screen", async () => {
      await completeThrough("consent");
      const state = await service.getOnboardingState(USER_ID);
      expect(state.stepId).toBe("done");
      expect(state.completed).toBe(true);
    });
  });

  describe("name screen", () => {
    it("creates a card with only the name and moves to the ZIP screen", async () => {
      const driver = await service.saveScreen(USER_ID, "name", { fullName: "  Pat Driver " });
      expect(driver).toMatchObject({
        profileId: USER_ID,
        fullName: "Pat Driver",
        city: null,
        state: null,
        zip: null,
        onboardingStep: stepNumber("zip"),
        cardCompleted: false,
        operatorTypes: [],
        employmentType: null,
        availability: [],
        yearsExperience: null,
        twicActive: null,
        medicalCardActive: null,
        ...NO_CDL_CHECKS,
        smsOptIn: false,
      });
    });

    it("rejects an invalid name and saves nothing", async () => {
      const error = await expectAppError(service.saveScreen(USER_ID, "name", { fullName: "P" }));
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual({ fullName: "Enter your name" });
      expect(drivers.rows.size).toBe(0);
    });

    it.each([undefined, null, {}, "text"])("rejects empty input %j", async (input) => {
      const error = await expectAppError(service.saveScreen(USER_ID, "name", input));
      expect(error.code).toBe("VALIDATION");
    });

    it("saving the name again keeps later answers and progress", async () => {
      await completeThrough("availability");
      const driver = await service.saveScreen(USER_ID, "name", { fullName: "Patricia Driver" });
      expect(driver.fullName).toBe("Patricia Driver");
      expect(driver.onboardingStep).toBe(stepNumber("cdlClass"));
      expect(driver.operatorTypes).toEqual(["cdl_driver"]);
    });

    it("a double submit that loses the insert race still saves", async () => {
      drivers.failNextCreateWith = AppError.conflict();
      const originalFind = drivers.findByProfileId.bind(drivers);
      let calls = 0;
      drivers.findByProfileId = async (profileId) => {
        calls += 1;
        if (calls === 2) drivers.rows.set(USER_ID, buildPartialDriver({ fullName: "First" }));
        return originalFind(profileId);
      };

      const driver = await service.saveScreen(USER_ID, "name", { fullName: "Second Submit" });
      expect(driver.fullName).toBe("Second Submit");
      expect(drivers.rows.size).toBe(1);
    });

    it("rethrows a create conflict when no card can be found afterwards", async () => {
      drivers.failNextCreateWith = AppError.conflict();
      const error = await expectAppError(service.saveScreen(USER_ID, "name", SCREEN_INPUTS.name));
      expect(error.code).toBe("CONFLICT");
    });

    it("rethrows unexpected repository errors", async () => {
      drivers.failNextCreateWith = AppError.internal(new Error("db down"));
      const error = await expectAppError(service.saveScreen(USER_ID, "name", SCREEN_INPUTS.name));
      expect(error.code).toBe("INTERNAL");
    });
  });

  describe("screen order", () => {
    it.each(SAVABLE_STEP_IDS.slice(1))("%s cannot be saved before the name", async (stepId) => {
      const error = await expectAppError(
        service.saveScreen(USER_ID, stepId, SCREEN_INPUTS[stepId]),
      );
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toBe("Start with the first step");
    });

    it("a screen cannot be skipped to", async () => {
      await completeThrough("zip");
      for (const stepId of [
        "workType",
        "equipment",
        "cdlClass",
        "credentials",
        "consent",
      ] as const) {
        const error = await expectAppError(
          service.saveScreen(USER_ID, stepId, SCREEN_INPUTS[stepId]),
        );
        expect(error.message).toBe("Finish the earlier steps first");
      }
      expect(card().onboardingStep).toBe(stepNumber("distance"));
    });

    it.each(["done", "basics", 1, "", null, undefined])("rejects unknown step %j", async (step) => {
      const error = await expectAppError(service.saveScreen(USER_ID, step, SCREEN_INPUTS.name));
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toBe("Unknown onboarding step");
    });
  });

  describe("about screens", () => {
    beforeEach(() => completeThrough("name"));

    it("saves the ZIP with the city and state the dataset gives it, and moves on", async () => {
      const driver = await service.saveScreen(USER_ID, "zip", { zip: "75201-1234" });
      expect(driver).toMatchObject({ zip: "75201", city: "Dallas", state: "TX" });
      expect(driver.onboardingStep).toBe(stepNumber("distance"));
    });

    it("takes city, state and coordinates from the bundled dataset, never from the client", async () => {
      const driver = await service.saveScreen(USER_ID, "zip", {
        zip: "75201",
        city: "Typed",
        state: "ZZ",
        lat: 0,
        lng: 0,
      });
      expect(driver).toMatchObject({ city: "Dallas", state: "TX" });
      expect(driver.lat).toBe(32.78111);
      expect(driver.lng).toBe(-96.79722);
      expect(zips.calls).toEqual(["75201"]);
    });

    it("rejects a ZIP the dataset does not know and keeps the card as it was", async () => {
      await service.saveScreen(USER_ID, "zip", { zip: "75201" });
      const error = await expectAppError(service.saveScreen(USER_ID, "zip", { zip: "99999" }));
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual({ zip: "We could not find that ZIP. Check the number." });
      expect(card()).toMatchObject({ zip: "75201", city: "Dallas", lat: 32.78111 });
    });

    it("rejects a bad ZIP with a plain message", async () => {
      const error = await expectAppError(
        service.saveScreen(USER_ID, "zip", { zip: "6060", state: "IL" }),
      );
      expect(error.fieldErrors).toEqual({ zip: "Enter a 5-digit ZIP code, like 60601" });
      expect(card().zip).toBeNull();
    });

    it("saves the travel distance", async () => {
      await service.saveScreen(USER_ID, "zip", SCREEN_INPUTS.zip);
      const driver = await service.saveScreen(USER_ID, "distance", { serviceRadiusMiles: "250" });
      expect(driver.serviceRadiusMiles).toBe(250);
      expect(driver.onboardingStep).toBe(stepNumber("workType"));
    });
  });

  describe("work screens", () => {
    beforeEach(() => completeThrough("distance"));

    it("saves work types without duplicates and moves to employment type", async () => {
      const driver = await service.saveScreen(USER_ID, "workType", {
        operatorTypes: ["mechanic", "cdl_driver", "mechanic"],
      });
      expect(driver.operatorTypes).toEqual(["mechanic", "cdl_driver"]);
      expect(driver.onboardingStep).toBe(stepNumber("employmentType"));
    });

    it("requires at least one work type", async () => {
      const error = await expectAppError(
        service.saveScreen(USER_ID, "workType", { operatorTypes: [] }),
      );
      expect(error.fieldErrors).toEqual({ operatorTypes: "Pick at least one kind of work" });
    });

    it("saves the employment type and sends a CDL driver to the driving-style screen", async () => {
      await service.saveScreen(USER_ID, "workType", SCREEN_INPUTS.workType);
      for (const employmentType of ["w2", "owner_operator_1099", "either"] as const) {
        const driver = await service.saveScreen(USER_ID, "employmentType", { employmentType });
        expect(driver.employmentType).toBe(employmentType);
      }
      expect(card().onboardingStep).toBe(stepNumber("drivingStyle"));
    });

    it("rejects an unknown employment type", async () => {
      await service.saveScreen(USER_ID, "workType", SCREEN_INPUTS.workType);
      const error = await expectAppError(
        service.saveScreen(USER_ID, "employmentType", { employmentType: "contractor" }),
      );
      expect(error.fieldErrors).toEqual({ employmentType: EMPLOYMENT_MESSAGE });
      expect(card().employmentType).toBeNull();
    });

    it("skips the driving-style and equipment screens for work without CDL driving", async () => {
      await service.saveScreen(USER_ID, "workType", {
        operatorTypes: ["mechanic", "yard_spotter"],
      });
      const driver = await service.saveScreen(USER_ID, "employmentType", {
        employmentType: "either",
      });
      expect(driver.onboardingStep).toBe(stepNumber("experience"));
      await expect(service.getOnboardingState(USER_ID)).resolves.toMatchObject({
        stepId: "experience",
      });
      expect(driver).toMatchObject(NO_CDL_CHECKS);
    });

    it("resumes past a CDL-only screen a driver was parked on before dropping CDL work", async () => {
      await completeThrough("employmentType");
      expect(card().onboardingStep).toBe(stepNumber("drivingStyle"));
      // Back to the work type, CDL driving dropped: progress stays, the screen no longer applies.
      await service.saveScreen(USER_ID, "workType", { operatorTypes: ["mechanic"] });
      expect(card().onboardingStep).toBe(stepNumber("drivingStyle"));
      await expect(service.getOnboardingState(USER_ID)).resolves.toMatchObject({
        stepId: "experience",
      });
      // The record screen likewise, once the papers are done.
      await completeThrough("credentials");
      await service.saveScreen(USER_ID, "documents", {});
      await service.saveScreen(USER_ID, "workType", { operatorTypes: ["yard_spotter"] });
      await service.saveScreen(USER_ID, "cdlClass", { cdlClass: "none" });
      await expect(service.getOnboardingState(USER_ID)).resolves.toMatchObject({ stepId: "bio" });
    });

    it("saves driving styles without duplicates", async () => {
      await completeThrough("employmentType");
      const driver = await service.saveScreen(USER_ID, "drivingStyle", {
        drivingStyles: ["otr", "regional", "otr"],
      });
      expect(driver.drivingStyles).toEqual(["otr", "regional"]);
      expect(driver.onboardingStep).toBe(stepNumber("equipment"));
    });

    it("requires at least one driving style", async () => {
      await completeThrough("employmentType");
      const error = await expectAppError(
        service.saveScreen(USER_ID, "drivingStyle", { drivingStyles: [] }),
      );
      expect(error.fieldErrors).toEqual({ drivingStyles: DRIVING_STYLE_MESSAGE });
    });

    it("saves the equipment and the transmission answer together", async () => {
      await completeThrough("drivingStyle");
      const driver = await service.saveScreen(USER_ID, "equipment", {
        transmission: "automatic_only",
        equipmentTypes: ["reefer", "reefer", "container_drayage"],
      });
      expect(driver.transmission).toBe("automatic_only");
      expect(driver.equipmentTypes).toEqual(["reefer", "container_drayage"]);
      expect(driver.onboardingStep).toBe(stepNumber("experience"));
    });

    it("requires both the equipment and the transmission answer", async () => {
      await completeThrough("drivingStyle");
      const error = await expectAppError(service.saveScreen(USER_ID, "equipment", {}));
      expect(error.fieldErrors).toEqual({
        transmission: TRANSMISSION_MESSAGE,
        equipmentTypes: EQUIPMENT_MESSAGE,
      });
    });

    it("saves experience, including zero", async () => {
      await completeThrough("equipment");
      const driver = await service.saveScreen(USER_ID, "experience", { yearsExperience: 0 });
      expect(driver.yearsExperience).toBe(0);
    });

    it("rejects a blank experience", async () => {
      await completeThrough("equipment");
      const error = await expectAppError(
        service.saveScreen(USER_ID, "experience", { yearsExperience: "" }),
      );
      expect(error.fieldErrors).toEqual({
        yearsExperience: "Pick how many years you have done this work",
      });
    });

    it("saves availability", async () => {
      await completeThrough("experience");
      const driver = await service.saveScreen(USER_ID, "availability", {
        availability: ["on_call", "on_call"],
      });
      expect(driver.availability).toEqual(["on_call"]);
      expect(driver.onboardingStep).toBe(stepNumber("cdlClass"));
    });
  });

  describe("license screens", () => {
    beforeEach(() => completeThrough("availability"));

    it("saves a CDL class and moves to endorsements", async () => {
      const driver = await service.saveScreen(USER_ID, "cdlClass", { cdlClass: "B" });
      expect(driver.cdlClass).toBe("B");
      expect(driver.onboardingStep).toBe(stepNumber("endorsements"));
    });

    it("a CDL driver cannot pick No CDL", async () => {
      const error = await expectAppError(
        service.saveScreen(USER_ID, "cdlClass", { cdlClass: "none" }),
      );
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual({ cdlClass: CDL_CONFLICT_MESSAGE });
      expect(card().cdlClass).toBe("none");
      expect(card().onboardingStep).toBe(stepNumber("cdlClass"));
    });

    it("No CDL skips the endorsements screen and clears endorsements", async () => {
      await service.saveScreen(USER_ID, "workType", { operatorTypes: ["yard_spotter"] });
      await service.saveScreen(USER_ID, "cdlClass", { cdlClass: "A" });
      await service.saveScreen(USER_ID, "endorsements", { endorsements: ["H"] });
      const driver = await service.saveScreen(USER_ID, "cdlClass", { cdlClass: "none" });
      expect(driver.endorsements).toEqual([]);
      expect(driver.onboardingStep).toBe(stepNumber("certifications"));
      await expect(service.getOnboardingState(USER_ID)).resolves.toMatchObject({
        stepId: "certifications",
      });
    });

    it("X always brings H and N, in display order", async () => {
      await service.saveScreen(USER_ID, "cdlClass", { cdlClass: "A" });
      const driver = await service.saveScreen(USER_ID, "endorsements", {
        endorsements: ["T", "X"],
      });
      expect(driver.endorsements).toEqual(["X", "H", "N", "T"]);
      expect(driver.onboardingStep).toBe(stepNumber("certifications"));
    });

    it("endorsements saved for a driver without a CDL are dropped", async () => {
      await service.saveScreen(USER_ID, "workType", { operatorTypes: ["mechanic"] });
      await service.saveScreen(USER_ID, "cdlClass", { cdlClass: "none" });
      const driver = await service.saveScreen(USER_ID, "endorsements", { endorsements: ["H"] });
      expect(driver.endorsements).toEqual([]);
    });

    it("saves certifications without case-insensitive duplicates and moves to the cards", async () => {
      await service.saveScreen(USER_ID, "cdlClass", SCREEN_INPUTS.cdlClass);
      await service.saveScreen(USER_ID, "endorsements", SCREEN_INPUTS.endorsements);
      const driver = await service.saveScreen(USER_ID, "certifications", {
        certifications: ["TWIC", "twic", " Forklift "],
      });
      expect(driver.certifications).toEqual(["TWIC", "Forklift"]);
      expect(driver.onboardingStep).toBe(stepNumber("credentials"));
    });

    it("saves the TWIC and medical card answers, whatever they are", async () => {
      await completeThrough("certifications");
      const driver = await service.saveScreen(USER_ID, "credentials", {
        twicActive: false,
        medicalCardActive: true,
      });
      expect(driver.twicActive).toBe(false);
      expect(driver.medicalCardActive).toBe(true);
      expect(driver.onboardingStep).toBe(stepNumber("documents"));
    });

    it("needs a real yes or no for both cards", async () => {
      await completeThrough("certifications");
      const error = await expectAppError(
        service.saveScreen(USER_ID, "credentials", { twicActive: "true" }),
      );
      expect(error.fieldErrors).toEqual({
        twicActive: TWIC_MESSAGE,
        medicalCardActive: MEDICAL_CARD_MESSAGE,
      });
      expect(card().twicActive).toBeNull();
    });
  });

  describe("papers and finish screens", () => {
    beforeEach(() => completeThrough("credentials"));

    it("papers can be skipped with no input, and a CDL driver goes on to the record", async () => {
      const driver = await service.saveScreen(USER_ID, "documents", undefined);
      expect(driver.onboardingStep).toBe(stepNumber("compliance"));
      expect(driver.cardCompleted).toBe(false);
    });

    it("after the papers, work without CDL driving goes straight to about you", async () => {
      await service.saveScreen(USER_ID, "workType", { operatorTypes: ["yard_spotter"] });
      await service.saveScreen(USER_ID, "cdlClass", { cdlClass: "none" });
      const driver = await service.saveScreen(USER_ID, "documents", {});
      expect(driver.onboardingStep).toBe(stepNumber("bio"));
    });

    it("saves the Clearinghouse and MVR answers, whatever they are", async () => {
      await service.saveScreen(USER_ID, "documents", {});
      const driver = await service.saveScreen(USER_ID, "compliance", {
        clearinghouseRegistered: false,
        mvrClean3Years: false,
      });
      expect(driver.clearinghouseRegistered).toBe(false);
      expect(driver.mvrClean3Years).toBe(false);
      expect(driver.onboardingStep).toBe(stepNumber("bio"));
    });

    it("needs a real answer for both record questions", async () => {
      await service.saveScreen(USER_ID, "documents", {});
      const error = await expectAppError(
        service.saveScreen(USER_ID, "compliance", { clearinghouseRegistered: true }),
      );
      expect(error.fieldErrors).toEqual({ mvrClean3Years: MVR_MESSAGE });
      const both = await expectAppError(service.saveScreen(USER_ID, "compliance", null));
      expect(both.fieldErrors).toEqual({
        clearinghouseRegistered: CLEARINGHOUSE_MESSAGE,
        mvrClean3Years: MVR_MESSAGE,
      });
    });

    it("saves the bio, and blank as null", async () => {
      await completeThrough("compliance");
      expect((await service.saveScreen(USER_ID, "bio", { bio: "  Hi  " })).bio).toBe("Hi");
      expect((await service.saveScreen(USER_ID, "bio", { bio: "" })).bio).toBeNull();
    });

    it("rejects a bio over 500 characters", async () => {
      await completeThrough("compliance");
      const error = await expectAppError(
        service.saveScreen(USER_ID, "bio", { bio: "x".repeat(501) }),
      );
      expect(error.fieldErrors).toEqual({ bio: "Keep it to 500 characters or fewer" });
    });
  });

  describe("consent screen", () => {
    beforeEach(() => completeThrough("bio"));

    it("stores the exact consent text with a timestamp and completes the card", async () => {
      const driver = await service.saveScreen(USER_ID, "consent", { consent: true });
      expect(driver.smsOptIn).toBe(true);
      expect(driver.smsOptInText).toBe(SMS_CONSENT_TEXT);
      expect(driver.smsOptInAt).toBe("2026-10-05T15:30:00.000Z");
      expect(driver.cardCompleted).toBe(true);
      expect(driver.onboardingStep).toBe(18);
    });

    it.each([{ consent: false }, {}, { consent: "true" }, undefined])(
      "cannot finish without consent (%j)",
      async (input) => {
        const error = await expectAppError(service.saveScreen(USER_ID, "consent", input));
        expect(error.code).toBe("VALIDATION");
        expect(error.fieldErrors).toEqual({ consent: "Tap the box to agree before you finish" });
        expect(card().cardCompleted).toBe(false);
        expect(card().smsOptIn).toBe(false);
      },
    );

    it("writes the consent audit row, with the exact text and version, before completing", async () => {
      await service.saveScreen(USER_ID, "consent", { consent: true });
      expect(consentLog.entries).toEqual([
        {
          phone: buildProfile().phone,
          event: "opt_in",
          consentText: SMS_CONSENT_TEXT,
          consentVersion: "2026-10-v1",
          source: "onboarding",
        },
      ]);
      expect(logBuilt).toBe(1);
    });

    it("does not complete the card when the audit row cannot be written", async () => {
      consentLog.failNextRecordWith = new Error("log down");
      await expect(service.saveScreen(USER_ID, "consent", { consent: true })).rejects.toThrow(
        "log down",
      );
      expect(card().smsOptIn).toBe(false);
      expect(card().cardCompleted).toBe(false);
    });

    it("submitting consent twice keeps the original timestamp and text", async () => {
      const first = await service.saveScreen(USER_ID, "consent", { consent: true });
      const later = new DriverService(
        drivers,
        profiles,
        zips,
        areas,
        () => consentLog,
        () => new Date("2027-01-01T00:00:00Z"),
      );
      const second = await later.saveScreen(USER_ID, "consent", { consent: true });
      expect(second.smsOptInAt).toBe(first.smsOptInAt);
      expect(second.cardCompleted).toBe(true);
    });

    it("refuses to complete a card that is missing required fields", async () => {
      drivers.rows.set(
        USER_ID,
        buildPartialDriver({ onboardingStep: stepNumber("consent"), state: "TX", zip: "75201" }),
      );
      const error = await expectAppError(service.saveScreen(USER_ID, "consent", { consent: true }));
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual({
        operatorTypes: "Required",
        employmentType: "Required",
        yearsExperience: "Required",
        availability: "Required",
        twicActive: "Required",
        medicalCardActive: "Required",
      });
      expect(card().cardCompleted).toBe(false);
    });

    it("refuses to complete a CDL driver without a CDL class", async () => {
      drivers.rows.set(
        USER_ID,
        buildDriver({
          onboardingStep: stepNumber("consent"),
          cardCompleted: false,
          smsOptIn: false,
          cdlClass: "none",
          endorsements: [],
        }),
      );
      const error = await expectAppError(service.saveScreen(USER_ID, "consent", { consent: true }));
      expect(error.fieldErrors).toEqual({ cdlClass: "Required" });
    });

    it("refuses to complete a CDL driver without the driving, equipment and record answers", async () => {
      drivers.rows.set(
        USER_ID,
        buildDriver({
          onboardingStep: stepNumber("consent"),
          cardCompleted: false,
          smsOptIn: false,
          ...NO_CDL_CHECKS,
        }),
      );
      const error = await expectAppError(service.saveScreen(USER_ID, "consent", { consent: true }));
      expect(error.fieldErrors).toEqual({
        drivingStyles: "Required",
        equipmentTypes: "Required",
        transmission: "Required",
        clearinghouseRegistered: "Required",
        mvrClean3Years: "Required",
      });
    });

    it("completes a yard spotter without the CDL-only answers", async () => {
      drivers.rows.set(
        USER_ID,
        buildDriver({
          onboardingStep: stepNumber("consent"),
          cardCompleted: false,
          smsOptIn: false,
          operatorTypes: ["yard_spotter"],
          cdlClass: "none",
          endorsements: [],
          ...NO_CDL_CHECKS,
        }),
      );
      const driver = await service.saveScreen(USER_ID, "consent", { consent: true });
      expect(driver.cardCompleted).toBe(true);
    });
  });

  describe("going back", () => {
    it("re-saving an earlier screen after completion keeps the card complete", async () => {
      await completeThrough("consent");
      const driver = await service.saveScreen(USER_ID, "experience", { yearsExperience: 12 });
      expect(driver.yearsExperience).toBe(12);
      expect(driver.onboardingStep).toBe(18);
      expect(driver.cardCompleted).toBe(true);
      expect(driver.smsOptIn).toBe(true);
    });

    it("re-saving papers never moves progress backwards", async () => {
      await completeThrough("consent");
      const driver = await service.saveScreen(USER_ID, "documents", undefined);
      expect(driver.onboardingStep).toBe(18);
    });

    it("dropping CDL driving later keeps the answers already given", async () => {
      await completeThrough("consent");
      const driver = await service.saveScreen(USER_ID, "workType", { operatorTypes: ["mechanic"] });
      expect(driver.drivingStyles).toEqual(["local_day_cab", "regional"]);
      expect(driver.onboardingStep).toBe(18);
    });
  });

  describe("updateCard (profile edit)", () => {
    it("requires an existing card", async () => {
      const error = await expectAppError(service.updateCard(USER_ID, validCard()));
      expect(error.code).toBe("NOT_FOUND");
    });

    it("updates every editable field and leaves consent and progress alone", async () => {
      await completeThrough("consent");
      const driver = await service.updateCard(
        USER_ID,
        validCard({
          fullName: "Patricia Driver",
          zip: "60601",
          serviceRadiusMiles: 120,
          operatorTypes: ["cdl_driver", "mechanic"],
          employmentType: "either",
          cdlClass: "B",
          endorsements: ["P"],
          yearsExperience: 15,
          certifications: ["Forklift"],
          drivingStyles: ["otr"],
          transmission: "automatic_only",
          equipmentTypes: ["reefer"],
          twicActive: false,
          medicalCardActive: false,
          clearinghouseRegistered: false,
          mvrClean3Years: false,
          availability: ["on_call"],
          bio: "",
        }),
      );
      expect(driver).toMatchObject({
        fullName: "Patricia Driver",
        // City, state and coordinates follow the ZIP, from the dataset.
        city: "Chicago",
        state: "IL",
        zip: "60601",
        lat: 41.8858,
        lng: -87.6181,
        serviceRadiusMiles: 120,
        operatorTypes: ["cdl_driver", "mechanic"],
        employmentType: "either",
        cdlClass: "B",
        endorsements: ["P"],
        yearsExperience: 15,
        certifications: ["Forklift"],
        drivingStyles: ["otr"],
        transmission: "automatic_only",
        equipmentTypes: ["reefer"],
        twicActive: false,
        medicalCardActive: false,
        clearinghouseRegistered: false,
        mvrClean3Years: false,
        availability: ["on_call"],
        bio: null,
        smsOptIn: true,
        cardCompleted: true,
        onboardingStep: 18,
      });
    });

    it("rejects invalid input and changes nothing", async () => {
      await completeThrough("consent");
      const before = drivers.rows.get(USER_ID);
      const error = await expectAppError(
        service.updateCard(USER_ID, validCard({ availability: [], zip: "x" })),
      );
      expect(error.code).toBe("VALIDATION");
      expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual(["availability", "zip"]);
      expect(drivers.rows.get(USER_ID)).toEqual(before);
    });

    it("rejects a CDL driver without a CDL", async () => {
      await completeThrough("consent");
      const error = await expectAppError(
        service.updateCard(USER_ID, validCard({ cdlClass: "none", endorsements: [] })),
      );
      expect(error.fieldErrors).toEqual({ cdlClass: "CDL driver work needs a CDL" });
    });

    it("rejects a CDL driver without the driving, equipment and record answers", async () => {
      await completeThrough("consent");
      const before = drivers.rows.get(USER_ID);
      const error = await expectAppError(service.updateCard(USER_ID, validCard(NO_CDL_CHECKS)));
      expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual([
        "clearinghouseRegistered",
        "drivingStyles",
        "equipmentTypes",
        "mvrClean3Years",
        "transmission",
      ]);
      expect(drivers.rows.get(USER_ID)).toEqual(before);
    });

    it("lets a mechanic save without the CDL-only answers", async () => {
      await completeThrough("consent");
      const driver = await service.updateCard(
        USER_ID,
        validCard({
          operatorTypes: ["mechanic"],
          cdlClass: "none",
          endorsements: [],
          ...NO_CDL_CHECKS,
        }),
      );
      expect(driver).toMatchObject({ operatorTypes: ["mechanic"], ...NO_CDL_CHECKS });
    });

    it("ignores attempts to set protected fields", async () => {
      await completeThrough("availability");
      const driver = await service.updateCard(
        USER_ID,
        validCard({
          cardCompleted: true,
          smsOptIn: true,
          smsOptedOut: true,
          onboardingStep: 18,
          profileId: OTHER_USER_ID,
          status: "approved",
        }),
      );
      expect(driver.cardCompleted).toBe(false);
      expect(driver.smsOptIn).toBe(false);
      expect(driver.smsOptedOut).toBe(false);
      expect(driver.onboardingStep).toBe(stepNumber("cdlClass"));
      expect(driver.profileId).toBe(USER_ID);
    });
  });

  describe("missingCardFields", () => {
    it("is empty for a complete card", () => {
      expect(missingCardFields(buildDriver())).toEqual([]);
    });

    it("lists each missing field with the screen that collects it, in flow order", () => {
      expect(missingCardFields(buildPartialDriver())).toEqual([
        { field: "zip", stepId: "zip" },
        { field: "operatorTypes", stepId: "workType" },
        { field: "employmentType", stepId: "employmentType" },
        { field: "yearsExperience", stepId: "experience" },
        { field: "availability", stepId: "availability" },
        { field: "twicActive", stepId: "credentials" },
        { field: "medicalCardActive", stepId: "credentials" },
      ]);
    });

    it("treats zero years of experience as provided", () => {
      expect(missingCardFields(buildDriver({ yearsExperience: 0 }))).toEqual([]);
    });

    it("flags a CDL driver without a class", () => {
      expect(missingCardFields(buildDriver({ cdlClass: "none", endorsements: [] }))).toEqual([
        { field: "cdlClass", stepId: "cdlClass" },
      ]);
    });

    it("requires the driving, equipment and record answers of CDL drivers only", () => {
      expect(missingCardFields(buildDriver(NO_CDL_CHECKS))).toEqual([
        { field: "drivingStyles", stepId: "drivingStyle" },
        { field: "equipmentTypes", stepId: "equipment" },
        { field: "transmission", stepId: "equipment" },
        { field: "clearinghouseRegistered", stepId: "compliance" },
        { field: "mvrClean3Years", stepId: "compliance" },
      ]);
      expect(
        missingCardFields(
          buildDriver({
            operatorTypes: ["mechanic"],
            cdlClass: "none",
            endorsements: [],
            ...NO_CDL_CHECKS,
          }),
        ),
      ).toEqual([]);
    });

    it("a false answer to a check counts as answered", () => {
      expect(
        missingCardFields(
          buildDriver({
            twicActive: false,
            medicalCardActive: false,
            clearinghouseRegistered: false,
            mvrClean3Years: false,
          }),
        ),
      ).toEqual([]);
    });
  });

  describe("launch area", () => {
    const dallas = { lat: 32.78111, lng: -96.79722 };

    it("asks the service areas about the saved coordinates and reports the answer", async () => {
      areas.setAreas((lat) => lat < 31);
      drivers.rows.set(USER_ID, buildDriver({ ...dallas, inServiceArea: null }));
      const state = await service.getOnboardingState(USER_ID);
      expect(state.driver?.inServiceArea).toBe(false);
      expect(areas.calls.at(-1)).toEqual(dallas);

      areas.setAreas(() => true);
      expect((await service.getCard(USER_ID))?.inServiceArea).toBe(true);
    });

    it("is unknown for a card without coordinates, and never asks", async () => {
      drivers.rows.set(USER_ID, buildPartialDriver());
      const state = await service.getOnboardingState(USER_ID);
      expect(state.driver?.inServiceArea).toBeNull();
      expect(areas.calls).toEqual([]);
    });

    it("answers for the ZIP just saved, on every screen save and profile edit", async () => {
      areas.setAreas((lat) => lat < 35);
      drivers.rows.set(USER_ID, buildPartialDriver());
      const afterZip = await service.saveScreen(USER_ID, "zip", SCREEN_INPUTS.zip);
      expect(afterZip.inServiceArea).toBe(true);
      expect(areas.calls.at(-1)).toEqual(dallas);

      const afterDistance = await service.saveScreen(USER_ID, "distance", SCREEN_INPUTS.distance);
      expect(afterDistance.inServiceArea).toBe(true);

      await completeThrough("bio");
      const edited = await service.updateCard(USER_ID, { ...validCard(), zip: "60601" });
      expect(edited.inServiceArea).toBe(false);
      expect(areas.calls.at(-1)).toEqual({ lat: 41.8858, lng: -87.6181 });
    });

    it("rejects an unknown ZIP on the profile and changes nothing", async () => {
      await completeThrough("consent");
      const before = drivers.rows.get(USER_ID);
      const error = await expectAppError(
        service.updateCard(USER_ID, { ...validCard(), zip: "99999" }),
      );
      expect(error.fieldErrors).toEqual({ zip: "We could not find that ZIP. Check the number." });
      expect(drivers.rows.get(USER_ID)).toEqual(before);
    });

    it("reflects a change to the areas on the next read, nothing is stored", async () => {
      drivers.rows.set(USER_ID, buildDriver({ ...dallas, inServiceArea: null }));
      expect((await service.getCard(USER_ID))?.inServiceArea).toBe(true);
      areas.setAreas(() => false);
      expect((await service.getCard(USER_ID))?.inServiceArea).toBe(false);
      expect(drivers.rows.get(USER_ID)).not.toHaveProperty("inServiceArea", false);
    });
  });

  it("uses the real clock by default", async () => {
    const realClock = new DriverService(drivers, profiles, zips, areas, () => consentLog);
    await completeThrough("bio");
    const before = Date.now();
    const driver = await realClock.saveScreen(USER_ID, "consent", { consent: true });
    expect(new Date(driver.smsOptInAt!).getTime()).toBeGreaterThanOrEqual(before);
  });
});
