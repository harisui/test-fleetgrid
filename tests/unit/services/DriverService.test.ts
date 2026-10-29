// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { SMS_CONSENT_TEXT } from "@/lib/constants";
import { SAVABLE_STEP_IDS, stepNumber, type SavableStepId } from "@/lib/onboarding/steps";
import {
  CDL_CLASS_MESSAGE,
  CONSENT_MESSAGE,
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

/** The answers sign-up no longer asks, left empty, as a card straight out of sign-up has them. */
const PROFILE_ONLY_EMPTY: Pick<
  LocatedDriver,
  | "employmentType"
  | "drivingStyles"
  | "clearinghouseRegistered"
  | "availability"
  | "certifications"
  | "bio"
> = {
  employmentType: null,
  drivingStyles: [],
  clearinghouseRegistered: null,
  availability: [],
  certifications: [],
  bio: null,
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

  /** Saves every screen up to and including `upTo` with valid input. */
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
        service.saveScreen(USER_ID, "lead", SCREEN_INPUTS.lead),
        service.updateCard(USER_ID, validCard()),
      ]) {
        expect((await expectAppError(call)).code).toBe("FORBIDDEN");
      }
      expect(drivers.rows.size).toBe(0);
    });

    it("rejects a user without a profile", async () => {
      const error = await expectAppError(
        service.saveScreen(OTHER_USER_ID, "lead", SCREEN_INPUTS.lead),
      );
      expect(error.code).toBe("FORBIDDEN");
    });

    it("rejects a blocked driver", async () => {
      profiles.rows.set(USER_ID, buildProfile({ status: "blocked" }));
      const error = await expectAppError(service.saveScreen(USER_ID, "lead", SCREEN_INPUTS.lead));
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
    it("a new driver has no card and starts on the lead screen", async () => {
      await expect(service.getCard(USER_ID)).resolves.toBeNull();
      await expect(service.getOnboardingState(USER_ID)).resolves.toEqual({
        stepId: "lead",
        completed: false,
        driver: null,
      });
    });

    it.each(SAVABLE_STEP_IDS.slice(0, -1).map((id, index) => [id, SAVABLE_STEP_IDS[index + 1]]))(
      "after saving %s the driver resumes on %s",
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

  describe("lead screen (the faster first step, 2026-10-28)", () => {
    it("creates the card at once as an unfinished lead: name, ZIP with its place, class, no texts", async () => {
      const driver = await service.saveScreen(USER_ID, "lead", {
        fullName: "  Pat Driver ",
        zip: "75201-1234",
        cdlClass: "B",
      });
      expect(driver).toMatchObject({
        profileId: USER_ID,
        fullName: "Pat Driver",
        zip: "75201",
        city: "Dallas",
        state: "TX",
        lat: 32.78111,
        lng: -96.79722,
        cdlClass: "B",
        onboardingStep: stepNumber("distance"),
        cardCompleted: false,
        // CDL drivers only at launch: the work type is set, not asked.
        operatorTypes: ["cdl_driver"],
        yearsExperience: null,
        mvrStatus: null,
        twicActive: null,
        medicalCardActive: null,
        transmission: null,
        equipmentTypes: [],
        ...PROFILE_ONLY_EMPTY,
        smsOptIn: false,
        smsOptInAt: null,
        smsOptInText: null,
      });
      expect(consentLog.entries).toEqual([]);
      expect(zips.calls).toEqual(["75201"]);
    });

    it("a ticked box on the lead records the opt-in, audit row first, before the card exists", async () => {
      const driver = await service.saveScreen(USER_ID, "lead", { ...SCREEN_INPUTS.lead, consent: true });
      expect(driver.smsOptIn).toBe(true);
      expect(driver.smsOptInText).toBe(SMS_CONSENT_TEXT);
      expect(driver.smsOptInAt).toBe("2026-10-05T15:30:00.000Z");
      expect(driver.cardCompleted).toBe(false);
      expect(consentLog.entries).toEqual([
        {
          phone: buildProfile().phone,
          event: "opt_in",
          consentText: SMS_CONSENT_TEXT,
          consentVersion: "2026-10-v1",
          source: "onboarding",
        },
      ]);
    });

    it("does not create the card when the audit row cannot be written", async () => {
      consentLog.failNextRecordWith = new Error("log down");
      await expect(service.saveScreen(USER_ID, "lead", { ...SCREEN_INPUTS.lead, consent: true })).rejects.toThrow("log down");
      expect(drivers.rows.size).toBe(0);
    });

    it("takes city, state and coordinates from the bundled dataset, never from the client", async () => {
      const driver = await service.saveScreen(USER_ID, "lead", {
        ...SCREEN_INPUTS.lead,
        city: "Typed",
        state: "ZZ",
        lat: 0,
        lng: 0,
      });
      expect(driver).toMatchObject({ city: "Dallas", state: "TX", lat: 32.78111, lng: -96.79722 });
    });

    it("rejects every missing answer at once and saves nothing", async () => {
      const error = await expectAppError(service.saveScreen(USER_ID, "lead", { fullName: "P" }));
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual({
        fullName: "Enter your name",
        zip: "Enter a 5-digit ZIP code, like 60601",
        cdlClass: CDL_CLASS_MESSAGE,
      });
      expect(drivers.rows.size).toBe(0);
    });

    it("rejects a ZIP the dataset does not know, and a class a CDL driver cannot hold", async () => {
      const unknown = await expectAppError(service.saveScreen(USER_ID, "lead", { ...SCREEN_INPUTS.lead, zip: "99999" }));
      expect(unknown.fieldErrors).toEqual({ zip: "We could not find that ZIP. Check the number." });
      for (const cdlClass of ["none", "D", "C"]) {
        const error = await expectAppError(service.saveScreen(USER_ID, "lead", { ...SCREEN_INPUTS.lead, cdlClass }));
        expect(error.fieldErrors).toEqual({ cdlClass: CDL_CLASS_MESSAGE });
      }
      expect(drivers.rows.size).toBe(0);
    });

    it.each([undefined, null, {}, "text"])("rejects empty input %j", async (input) => {
      const error = await expectAppError(service.saveScreen(USER_ID, "lead", input));
      expect(error.code).toBe("VALIDATION");
    });

    it("saving the lead again keeps later answers and progress, and can change the ZIP and class", async () => {
      await completeThrough("experience");
      const driver = await service.saveScreen(USER_ID, "lead", {
        fullName: "Patricia Driver",
        zip: "60601",
        cdlClass: "B",
      });
      expect(driver).toMatchObject({ fullName: "Patricia Driver", city: "Chicago", cdlClass: "B" });
      expect(driver.onboardingStep).toBe(stepNumber("record"));
      expect(driver.yearsExperience).toBe(8);
    });

    it("ticking the box on a second save records the opt-in; unticking after an opt-in records the opt-out", async () => {
      await completeThrough("lead");
      const on = await service.saveScreen(USER_ID, "lead", { ...SCREEN_INPUTS.lead, consent: true });
      expect(on.smsOptIn).toBe(true);
      const off = await service.saveScreen(USER_ID, "lead", { ...SCREEN_INPUTS.lead, consent: false });
      expect(off.smsOptIn).toBe(false);
      expect(off.smsOptInAt).toBeNull();
      expect(consentLog.entries.map((entry) => entry.event)).toEqual(["opt_in", "opt_out"]);
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

      const driver = await service.saveScreen(USER_ID, "lead", { ...SCREEN_INPUTS.lead, fullName: "Second Submit" });
      expect(driver.fullName).toBe("Second Submit");
      expect(drivers.rows.size).toBe(1);
    });

    it("rethrows a create conflict when no card can be found afterwards", async () => {
      drivers.failNextCreateWith = AppError.conflict();
      const error = await expectAppError(service.saveScreen(USER_ID, "lead", SCREEN_INPUTS.lead));
      expect(error.code).toBe("CONFLICT");
    });

    it("rethrows unexpected repository errors", async () => {
      drivers.failNextCreateWith = AppError.internal(new Error("db down"));
      const error = await expectAppError(service.saveScreen(USER_ID, "lead", SCREEN_INPUTS.lead));
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
      await completeThrough("lead");
      for (const stepId of ["experience", "record", "credentials", "equipment", "consent"] as const) {
        const error = await expectAppError(
          service.saveScreen(USER_ID, stepId, SCREEN_INPUTS[stepId]),
        );
        expect(error.message).toBe("Finish the earlier steps first");
      }
      expect(card().onboardingStep).toBe(stepNumber("distance"));
    });

    it.each(["done", "workType", "compliance", 1, "", null, undefined])(
      "rejects unknown step %j",
      async (step) => {
        const error = await expectAppError(service.saveScreen(USER_ID, step, SCREEN_INPUTS.lead));
        expect(error.code).toBe("VALIDATION");
        expect(error.message).toBe("Unknown onboarding step");
      },
    );
  });

  describe("driving screens: distance, years, record", () => {
    beforeEach(() => completeThrough("lead"));

    it("saves the travel distance and moves to the years", async () => {
      const driver = await service.saveScreen(USER_ID, "distance", { serviceRadiusMiles: "250" });
      expect(driver.serviceRadiusMiles).toBe(250);
      expect(driver.onboardingStep).toBe(stepNumber("experience"));
    });

    it("needs a distance", async () => {
      const error = await expectAppError(service.saveScreen(USER_ID, "distance", { serviceRadiusMiles: "" }));
      expect(error.fieldErrors).toEqual({ serviceRadiusMiles: "Pick how far you will travel" });
      expect(card().onboardingStep).toBe(stepNumber("distance"));
    });

    it("saves experience, including zero, and moves to the record", async () => {
      await service.saveScreen(USER_ID, "distance", SCREEN_INPUTS.distance);
      const driver = await service.saveScreen(USER_ID, "experience", { yearsExperience: 0 });
      expect(driver.yearsExperience).toBe(0);
      expect(driver.onboardingStep).toBe(stepNumber("record"));
    });

    it("rejects a blank experience", async () => {
      await service.saveScreen(USER_ID, "distance", SCREEN_INPUTS.distance);
      const error = await expectAppError(
        service.saveScreen(USER_ID, "experience", { yearsExperience: "" }),
      );
      expect(error.fieldErrors).toEqual({
        yearsExperience: "Pick how many years you have driven",
      });
    });

    it("saves the MVR level, whatever it is, and moves to the Clearinghouse and SAP page", async () => {
      await completeThrough("experience");
      const driver = await service.saveScreen(USER_ID, "record", { mvrStatus: "major_3_plus" });
      expect(driver.mvrStatus).toBe("major_3_plus");
      expect(driver.onboardingStep).toBe(stepNumber("clearinghouse"));
    });

    it.each([{}, { mvrStatus: true }, { mvrStatus: "none" }, null])(
      "needs one of the three MVR levels (%j)",
      async (input) => {
        await completeThrough("experience");
        const error = await expectAppError(service.saveScreen(USER_ID, "record", input));
        expect(error.fieldErrors).toEqual({ mvrStatus: MVR_MESSAGE });
        expect(card().mvrStatus).toBeNull();
      },
    );
  });

  describe("Clearinghouse and SAP screen (optional, 2026-10-29)", () => {
    beforeEach(() => completeThrough("record"));

    it("a tick saves a yes with the time, and moves to the cards", async () => {
      drivers.selfReportClock = () => "2026-10-29T15:00:00.000Z";
      const driver = await service.saveScreen(USER_ID, "clearinghouse", { clearinghouseConfirmed: true });
      expect(driver.clearinghouseSelfReportedAt).toBe("2026-10-29T15:00:00.000Z");
      expect(driver.onboardingStep).toBe(stepNumber("credentials"));
      expect(drivers.selfReportCalls).toEqual([{ driverId: card().id, confirmed: true }]);
    });

    it.each([{ clearinghouseConfirmed: false }, {}, undefined, { clearinghouseConfirmed: "true" }])(
      "Skip, or Continue without the tick (%j), saves no answer and still moves on",
      async (input) => {
        const driver = await service.saveScreen(USER_ID, "clearinghouse", input);
        expect(driver.clearinghouseSelfReportedAt).toBeNull();
        expect(driver.onboardingStep).toBe(stepNumber("credentials"));
      },
    );

    it("going back and unticking withdraws the earlier yes", async () => {
      await service.saveScreen(USER_ID, "clearinghouse", { clearinghouseConfirmed: true });
      const driver = await service.saveScreen(USER_ID, "clearinghouse", { clearinghouseConfirmed: false });
      expect(driver.clearinghouseSelfReportedAt).toBeNull();
      expect(drivers.selfReportCalls.map((call) => call.confirmed)).toEqual([true, false]);
    });

    it("never counts toward a complete card: skipped, the sign-up still finishes", async () => {
      await completeThrough("consent");
      expect(card().cardCompleted).toBe(true);
      // completeThrough ticked it; withdrawing it leaves the card complete.
      const driver = await service.setClearinghouseSelfReport(USER_ID, { clearinghouseConfirmed: false });
      expect(driver.cardCompleted).toBe(true);
      expect(driver.clearinghouseSelfReportedAt).toBeNull();
      expect(missingCardFields(card())).toEqual([]);
    });
  });

  describe("setClearinghouseSelfReport (the profile box)", () => {
    beforeEach(() => completeThrough("consent"));

    it("unticking deletes the answer and its date; ticking again saves a new time; progress is untouched", async () => {
      drivers.selfReportClock = () => "2026-10-30T09:00:00.000Z";
      const withdrawn = await service.setClearinghouseSelfReport(USER_ID, { clearinghouseConfirmed: false });
      expect(withdrawn.clearinghouseSelfReportedAt).toBeNull();
      const again = await service.setClearinghouseSelfReport(USER_ID, { clearinghouseConfirmed: true });
      expect(again.clearinghouseSelfReportedAt).toBe("2026-10-30T09:00:00.000Z");
      expect(again).toMatchObject({ cardCompleted: true, onboardingStep: 12 });
      expect(again.inServiceArea).not.toBeUndefined();
    });

    it("needs a card and a driver", async () => {
      drivers.rows.clear();
      expect((await expectAppError(service.setClearinghouseSelfReport(USER_ID, { clearinghouseConfirmed: true }))).code).toBe("VALIDATION");
      profiles.rows.set(USER_ID, buildProfile({ role: "carrier" }));
      expect((await expectAppError(service.setClearinghouseSelfReport(USER_ID, { clearinghouseConfirmed: true }))).code).toBe("FORBIDDEN");
    });
  });

  describe("cards screen", () => {
    beforeEach(() => completeThrough("clearinghouse"));

    it("saves the TWIC and medical card answers, whatever they are, and moves to the letters", async () => {
      const driver = await service.saveScreen(USER_ID, "credentials", {
        twicActive: false,
        medicalCardActive: true,
      });
      expect(driver.twicActive).toBe(false);
      expect(driver.medicalCardActive).toBe(true);
      expect(driver.onboardingStep).toBe(stepNumber("endorsements"));
    });

    it("needs a real yes or no for both cards", async () => {
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

  describe("letters and equipment screens", () => {
    beforeEach(() => completeThrough("credentials"));

    it("X always brings H and N, in display order, then the transmission question follows", async () => {
      const driver = await service.saveScreen(USER_ID, "endorsements", {
        endorsements: ["T", "X"],
      });
      expect(driver.endorsements).toEqual(["X", "H", "N", "T"]);
      expect(driver.onboardingStep).toBe(stepNumber("transmission"));
    });

    it("no endorsements is a valid answer", async () => {
      const driver = await service.saveScreen(USER_ID, "endorsements", { endorsements: [] });
      expect(driver.endorsements).toEqual([]);
      expect(driver.onboardingStep).toBe(stepNumber("transmission"));
    });

    it("saves the transmission answer and moves to the equipment", async () => {
      await service.saveScreen(USER_ID, "endorsements", SCREEN_INPUTS.endorsements);
      const driver = await service.saveScreen(USER_ID, "transmission", {
        transmission: "automatic_only",
      });
      expect(driver.transmission).toBe("automatic_only");
      expect(driver.onboardingStep).toBe(stepNumber("equipment"));
    });

    it("needs a transmission answer", async () => {
      await service.saveScreen(USER_ID, "endorsements", SCREEN_INPUTS.endorsements);
      const error = await expectAppError(
        service.saveScreen(USER_ID, "transmission", { transmission: "stick" }),
      );
      expect(error.fieldErrors).toEqual({ transmission: TRANSMISSION_MESSAGE });
      expect(card().transmission).toBeNull();
    });

    it("saves the equipment without duplicates and moves to consent", async () => {
      await completeThrough("transmission");
      const driver = await service.saveScreen(USER_ID, "equipment", {
        equipmentTypes: ["reefer", "reefer", "container_drayage"],
      });
      expect(driver.equipmentTypes).toEqual(["reefer", "container_drayage"]);
      expect(driver.onboardingStep).toBe(stepNumber("heardFrom"));
    });

    it("requires at least one kind of equipment", async () => {
      await completeThrough("transmission");
      const error = await expectAppError(
        service.saveScreen(USER_ID, "equipment", { equipmentTypes: [] }),
      );
      expect(error.fieldErrors).toEqual({ equipmentTypes: EQUIPMENT_MESSAGE });
    });
  });

  describe("heard-from screen (optional, 2026-10-28)", () => {
    beforeEach(() => completeThrough("equipment"));

    it("saves the answer and moves to consent; the free text counts only with Other", async () => {
      const flyer = await service.saveScreen(USER_ID, "heardFrom", { heardFrom: "flyer", heardFromOther: "ignored" });
      expect(flyer.heardFrom).toBe("flyer");
      expect(flyer.heardFromOther).toBeNull();
      expect(flyer.onboardingStep).toBe(stepNumber("consent"));

      const other = await service.saveScreen(USER_ID, "heardFrom", { heardFrom: "other", heardFromOther: "  Radio ad " });
      expect(other).toMatchObject({ heardFrom: "other", heardFromOther: "Radio ad" });
    });

    it.each([{}, { heardFrom: "" }, { heardFrom: null }, undefined])("goes on without an answer (%j)", async (input) => {
      const driver = await service.saveScreen(USER_ID, "heardFrom", input);
      expect(driver.heardFrom).toBeNull();
      expect(driver.heardFromOther).toBeNull();
      expect(driver.onboardingStep).toBe(stepNumber("consent"));
    });

    it("completes the card here when the lead already gave consent: the consent screen is not shown again", async () => {
      await service.saveScreen(USER_ID, "lead", { ...SCREEN_INPUTS.lead, consent: true });
      const driver = await service.saveScreen(USER_ID, "heardFrom", { heardFrom: "flyer" });
      expect(driver).toMatchObject({ heardFrom: "flyer", cardCompleted: true, onboardingStep: 12, smsOptIn: true });
      expect(consentLog.entries.map((entry) => entry.event)).toEqual(["opt_in"]);
      const state = await service.getOnboardingState(USER_ID);
      expect(state).toMatchObject({ stepId: "done", completed: true });
    });

    it("still refuses to complete a card with a missing answer, even with consent on record", async () => {
      await service.saveScreen(USER_ID, "lead", { ...SCREEN_INPUTS.lead, consent: true });
      drivers.rows.set(USER_ID, { ...card(), transmission: null });
      const error = await expectAppError(service.saveScreen(USER_ID, "heardFrom", { heardFrom: "flyer" }));
      expect(error.fieldErrors).toEqual({ transmission: "Required" });
      expect(card().cardCompleted).toBe(false);
    });

    it("rejects an answer that is not on the list, and a long Other", async () => {
      const unknown = await expectAppError(service.saveScreen(USER_ID, "heardFrom", { heardFrom: "tv" }));
      expect(unknown.fieldErrors).toEqual({ heardFrom: "Pick one, or go on without" });
      const long = await expectAppError(
        service.saveScreen(USER_ID, "heardFrom", { heardFrom: "other", heardFromOther: "x".repeat(81) }),
      );
      expect(long.fieldErrors).toHaveProperty("heardFromOther");
      expect(card().onboardingStep).toBe(stepNumber("heardFrom"));
    });
  });

  describe("consent screen", () => {
    beforeEach(() => completeThrough("heardFrom"));

    it("stores the exact consent text with a timestamp and completes the card", async () => {
      const driver = await service.saveScreen(USER_ID, "consent", { consent: true });
      expect(driver.smsOptIn).toBe(true);
      expect(driver.smsOptInText).toBe(SMS_CONSENT_TEXT);
      expect(driver.smsOptInAt).toBe("2026-10-05T15:30:00.000Z");
      expect(driver.cardCompleted).toBe(true);
      expect(driver.onboardingStep).toBe(12);
      // Nothing from the profile page is needed to finish.
      expect(driver).toMatchObject(PROFILE_ONLY_EMPTY);
    });

    it.each([{ consent: false }, {}, undefined])(
      "finishes without consent (%j): the card completes, no opt-in, no audit row",
      async (input) => {
        const driver = await service.saveScreen(USER_ID, "consent", input);
        expect(driver.cardCompleted).toBe(true);
        expect(driver.onboardingStep).toBe(12);
        expect(driver.smsOptIn).toBe(false);
        expect(driver.smsOptInAt).toBeNull();
        expect(driver.smsOptInText).toBeNull();
        expect(consentLog.entries).toEqual([]);
      },
    );

    it("rejects an answer that is not a boolean", async () => {
      const error = await expectAppError(service.saveScreen(USER_ID, "consent", { consent: "true" }));
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual({ consent: CONSENT_MESSAGE });
      expect(card().cardCompleted).toBe(false);
    });

    it("unticking the box after an earlier opt-in records the opt-out and keeps the card complete", async () => {
      await service.saveScreen(USER_ID, "consent", { consent: true });
      const driver = await service.saveScreen(USER_ID, "consent", { consent: false });
      expect(driver.cardCompleted).toBe(true);
      expect(driver.smsOptIn).toBe(false);
      expect(driver.smsOptInAt).toBeNull();
      expect(driver.smsOptInText).toBeNull();
      expect(consentLog.entries.map((entry) => entry.event)).toEqual(["opt_in", "opt_out"]);
      expect(consentLog.entries[1]).toMatchObject({ source: "onboarding" });
    });

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
        cdlClass: "Required",
        yearsExperience: "Required",
        mvrStatus: "Required",
        twicActive: "Required",
        medicalCardActive: "Required",
        transmission: "Required",
        equipmentTypes: "Required",
      });
      expect(card().cardCompleted).toBe(false);
    });

    it("refuses to complete a card without a CDL class", async () => {
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
  });

  describe("setSmsConsent (the profile page switch)", () => {
    beforeEach(() => completeThrough("heardFrom"));

    it("turns texts on with the audit row first, from the profile", async () => {
      await service.saveScreen(USER_ID, "consent", { consent: false });
      const driver = await service.setSmsConsent(USER_ID, { consent: true });
      expect(driver.smsOptIn).toBe(true);
      expect(driver.smsOptInText).toBe(SMS_CONSENT_TEXT);
      expect(driver.smsOptInAt).toBe("2026-10-05T15:30:00.000Z");
      expect(driver.inServiceArea).not.toBeUndefined();
      expect(consentLog.entries).toEqual([
        {
          phone: buildProfile().phone,
          event: "opt_in",
          consentText: SMS_CONSENT_TEXT,
          consentVersion: "2026-10-v1",
          source: "profile",
        },
      ]);
    });

    it("turns texts off, recording the opt-out", async () => {
      await service.saveScreen(USER_ID, "consent", { consent: true });
      const driver = await service.setSmsConsent(USER_ID, { consent: false });
      expect(driver.smsOptIn).toBe(false);
      expect(consentLog.entries.map((entry) => [entry.event, entry.source])).toEqual([
        ["opt_in", "onboarding"],
        ["opt_out", "profile"],
      ]);
    });

    it("does nothing when the answer matches what is on record", async () => {
      await service.saveScreen(USER_ID, "consent", { consent: true });
      const driver = await service.setSmsConsent(USER_ID, { consent: true });
      expect(driver.smsOptIn).toBe(true);
      expect(consentLog.entries).toHaveLength(1);
    });

    it("cannot undo a STOP reply: only START does", async () => {
      await service.saveScreen(USER_ID, "consent", { consent: true });
      drivers.rows.set(USER_ID, { ...card(), smsOptedOut: true, smsOptedOutAt: "2026-10-06T00:00:00Z" });
      const error = await expectAppError(service.setSmsConsent(USER_ID, { consent: true }));
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toMatch(/replying START/);
      expect(consentLog.entries).toHaveLength(1);
    });

    it("does not turn texts on when the audit row cannot be written", async () => {
      await service.saveScreen(USER_ID, "consent", { consent: false });
      consentLog.failNextRecordWith = new Error("log down");
      await expect(service.setSmsConsent(USER_ID, { consent: true })).rejects.toThrow("log down");
      expect(card().smsOptIn).toBe(false);
    });

    it("needs an explicit answer", async () => {
      const error = await expectAppError(service.setSmsConsent(USER_ID, {}));
      expect(error.fieldErrors).toEqual({ consent: CONSENT_MESSAGE });
    });
  });

  describe("going back", () => {
    it("re-saving an earlier screen after completion keeps the card complete", async () => {
      await completeThrough("consent");
      const driver = await service.saveScreen(USER_ID, "experience", { yearsExperience: 12 });
      expect(driver.yearsExperience).toBe(12);
      expect(driver.onboardingStep).toBe(12);
      expect(driver.cardCompleted).toBe(true);
      expect(driver.smsOptIn).toBe(true);
    });

    it("re-saving the lead never moves progress backwards", async () => {
      await completeThrough("record");
      const driver = await service.saveScreen(USER_ID, "lead", { ...SCREEN_INPUTS.lead, zip: "60601" });
      expect(driver.city).toBe("Chicago");
      expect(driver.onboardingStep).toBe(stepNumber("clearinghouse"));
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
          employmentType: "either",
          cdlClass: "B",
          endorsements: ["N"],
          yearsExperience: 15,
          certifications: ["Forklift"],
          drivingStyles: ["regional"],
          transmission: "automatic_only",
          equipmentTypes: ["reefer"],
          twicActive: false,
          medicalCardActive: false,
          clearinghouseRegistered: false,
          mvrStatus: "minor_1_2",
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
        operatorTypes: ["cdl_driver"],
        employmentType: "either",
        cdlClass: "B",
        endorsements: ["N"],
        yearsExperience: 15,
        certifications: ["Forklift"],
        drivingStyles: ["regional"],
        transmission: "automatic_only",
        equipmentTypes: ["reefer"],
        twicActive: false,
        medicalCardActive: false,
        clearinghouseRegistered: false,
        mvrStatus: "minor_1_2",
        availability: ["on_call"],
        bio: null,
        smsOptIn: true,
        cardCompleted: true,
        onboardingStep: 12,
      });
    });

    it("saves a card straight out of sign-up, with the profile-only answers left empty", async () => {
      await completeThrough("consent");
      const driver = await service.updateCard(
        USER_ID,
        validCard({
          employmentType: undefined,
          drivingStyles: undefined,
          clearinghouseRegistered: undefined,
          availability: undefined,
          certifications: undefined,
          bio: undefined,
        }),
      );
      expect(driver).toMatchObject(PROFILE_ONLY_EMPTY);
    });

    it("rejects invalid input and changes nothing", async () => {
      await completeThrough("consent");
      const before = drivers.rows.get(USER_ID);
      const error = await expectAppError(
        service.updateCard(USER_ID, validCard({ serviceRadiusMiles: 1, zip: "x" })),
      );
      expect(error.code).toBe("VALIDATION");
      expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual(["serviceRadiusMiles", "zip"]);
      expect(drivers.rows.get(USER_ID)).toEqual(before);
    });

    it("rejects No CDL on the profile too", async () => {
      await completeThrough("consent");
      const error = await expectAppError(
        service.updateCard(USER_ID, validCard({ cdlClass: "none", endorsements: [] })),
      );
      expect(error.fieldErrors).toEqual({ cdlClass: CDL_CLASS_MESSAGE });
    });

    it("rejects a card without the record, transmission and equipment answers", async () => {
      await completeThrough("consent");
      const before = drivers.rows.get(USER_ID);
      const error = await expectAppError(
        service.updateCard(
          USER_ID,
          validCard({ transmission: null, equipmentTypes: [], mvrStatus: null }),
        ),
      );
      expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual([
        "equipmentTypes",
        "mvrStatus",
        "transmission",
      ]);
      expect(drivers.rows.get(USER_ID)).toEqual(before);
    });

    it("ignores attempts to set protected fields", async () => {
      await completeThrough("experience");
      const driver = await service.updateCard(
        USER_ID,
        validCard({
          cardCompleted: true,
          smsOptIn: true,
          smsOptedOut: true,
          onboardingStep: 12,
          operatorTypes: ["mechanic"],
          profileId: OTHER_USER_ID,
          status: "approved",
        }),
      );
      expect(driver.cardCompleted).toBe(false);
      expect(driver.smsOptIn).toBe(false);
      expect(driver.smsOptedOut).toBe(false);
      expect(driver.onboardingStep).toBe(stepNumber("record"));
      expect(driver.operatorTypes).toEqual(["cdl_driver"]);
      expect(driver.profileId).toBe(USER_ID);
    });
  });

  describe("missingCardFields", () => {
    it("is empty for a complete card", () => {
      expect(missingCardFields(buildDriver())).toEqual([]);
    });

    it("lists each missing sign-up answer with the screen that collects it, in flow order", () => {
      expect(missingCardFields(buildPartialDriver())).toEqual([
        { field: "zip", stepId: "lead" },
        { field: "cdlClass", stepId: "lead" },
        { field: "yearsExperience", stepId: "experience" },
        { field: "mvrStatus", stepId: "record" },
        { field: "twicActive", stepId: "credentials" },
        { field: "medicalCardActive", stepId: "credentials" },
        { field: "transmission", stepId: "transmission" },
        { field: "equipmentTypes", stepId: "equipment" },
      ]);
    });

    it("asks nothing from the profile page", () => {
      expect(missingCardFields(buildDriver(PROFILE_ONLY_EMPTY))).toEqual([]);
    });

    it("treats zero years of experience as provided", () => {
      expect(missingCardFields(buildDriver({ yearsExperience: 0 }))).toEqual([]);
    });

    it("a false answer to a check, or a bad record, counts as answered", () => {
      expect(
        missingCardFields(
          buildDriver({ twicActive: false, medicalCardActive: false, mvrStatus: "major_3_plus" }),
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
      const afterZip = await service.saveScreen(USER_ID, "lead", SCREEN_INPUTS.lead);
      expect(afterZip.inServiceArea).toBe(true);
      expect(areas.calls.at(-1)).toEqual(dallas);

      const afterDistance = await service.saveScreen(USER_ID, "distance", SCREEN_INPUTS.distance);
      expect(afterDistance.inServiceArea).toBe(true);

      await completeThrough("equipment");
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
    await completeThrough("heardFrom");
    const before = Date.now();
    const driver = await realClock.saveScreen(USER_ID, "consent", { consent: true });
    expect(new Date(driver.smsOptInAt!).getTime()).toBeGreaterThanOrEqual(before);
  });
});
