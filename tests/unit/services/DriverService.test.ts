// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { SMS_CONSENT_TEXT } from "@/lib/constants";
import { AppError } from "@/server/errors/AppError";
import { DriverService, missingCardFields } from "@/server/services/DriverService";
import { FakeDriverRepository } from "../../fakes/FakeDriverRepository";
import { FakeProfileRepository } from "../../fakes/FakeProfileRepository";
import {
  buildDriver,
  buildPartialDriver,
  buildProfile,
  OTHER_USER_ID,
  USER_ID,
  validAvailability,
  validBasics,
  validCard,
  validLicenses,
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

describe("DriverService", () => {
  let drivers: FakeDriverRepository;
  let profiles: FakeProfileRepository;
  let service: DriverService;

  beforeEach(() => {
    drivers = new FakeDriverRepository();
    profiles = new FakeProfileRepository([buildProfile()]);
    service = new DriverService(drivers, profiles, () => NOW);
  });

  /** Runs steps 1 to `upTo` with valid input. */
  async function completeSteps(upTo: number) {
    if (upTo >= 1) await service.saveStep(USER_ID, 1, validBasics());
    if (upTo >= 2) await service.saveStep(USER_ID, 2, validLicenses());
    if (upTo >= 3) await service.saveStep(USER_ID, 3, validAvailability());
    if (upTo >= 4) await service.saveStep(USER_ID, 4, undefined);
    if (upTo >= 5) await service.saveStep(USER_ID, 5, { consent: true });
  }

  describe("authorization", () => {
    it.each([
      ["a carrier", buildProfile({ role: "carrier" })],
      ["an admin", buildProfile({ role: "admin" })],
    ])("rejects %s on every method", async (_label, profile) => {
      profiles.rows.set(USER_ID, profile);
      for (const call of [
        service.getCard(USER_ID),
        service.getOnboardingState(USER_ID),
        service.saveStep(USER_ID, 1, validBasics()),
        service.updateCard(USER_ID, validCard()),
      ]) {
        expect((await expectAppError(call)).code).toBe("FORBIDDEN");
      }
      expect(drivers.rows.size).toBe(0);
    });

    it("rejects a user without a profile", async () => {
      const error = await expectAppError(service.saveStep(OTHER_USER_ID, 1, validBasics()));
      expect(error.code).toBe("FORBIDDEN");
    });

    it("rejects a blocked driver", async () => {
      profiles.rows.set(USER_ID, buildProfile({ status: "blocked" }));
      const error = await expectAppError(service.saveStep(USER_ID, 1, validBasics()));
      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).toMatch(/blocked/);
    });

    it("only ever touches the caller's own card", async () => {
      profiles.rows.set(OTHER_USER_ID, buildProfile({ id: OTHER_USER_ID, phone: "+15555550103" }));
      const other = buildDriver({ profileId: OTHER_USER_ID, fullName: "Other Driver" });
      drivers.rows.set(OTHER_USER_ID, other);

      await completeSteps(5);
      await service.updateCard(USER_ID, validCard({ fullName: "Changed Name" }));

      expect(drivers.rows.get(OTHER_USER_ID)).toEqual(other);
      await expect(service.getCard(OTHER_USER_ID)).resolves.toEqual(other);
    });
  });

  describe("getCard / getOnboardingState", () => {
    it("a new driver has no card and starts at step 1", async () => {
      await expect(service.getCard(USER_ID)).resolves.toBeNull();
      await expect(service.getOnboardingState(USER_ID)).resolves.toEqual({
        step: 1,
        completed: false,
        driver: null,
      });
    });

    it.each([1, 2, 3, 4])(
      "after saving step %i the driver resumes at the next step",
      async (step) => {
        await completeSteps(step);
        const state = await service.getOnboardingState(USER_ID);
        expect(state.step).toBe(step + 1);
        expect(state.completed).toBe(false);
        expect(state.driver).not.toBeNull();
      },
    );

    it("after consent the card is complete and the driver sees the done screen", async () => {
      await completeSteps(5);
      const state = await service.getOnboardingState(USER_ID);
      expect(state.step).toBe(6);
      expect(state.completed).toBe(true);
    });
  });

  describe("saveStep 1: basics", () => {
    it("creates a partial card and moves to step 2", async () => {
      const driver = await service.saveStep(USER_ID, 1, validBasics({ fullName: "  Pat Driver " }));
      expect(driver).toMatchObject({
        profileId: USER_ID,
        fullName: "Pat Driver",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        serviceRadiusMiles: 50,
        onboardingStep: 2,
        cardCompleted: false,
        operatorTypes: [],
        availability: [],
        yearsExperience: null,
        smsOptIn: false,
      });
    });

    it("rejects invalid input with field errors and saves nothing", async () => {
      const error = await expectAppError(
        service.saveStep(USER_ID, 1, validBasics({ zip: "123", state: "ZZ" })),
      );
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual({
        state: "Select your state",
        zip: "Enter a 5-digit ZIP code",
      });
      expect(drivers.rows.size).toBe(0);
    });

    it.each([undefined, null, {}, "text"])("rejects empty input %j", async (input) => {
      const error = await expectAppError(service.saveStep(USER_ID, 1, input));
      expect(error.code).toBe("VALIDATION");
    });

    it("saving step 1 again updates the card without losing later steps or progress", async () => {
      await completeSteps(3);
      const driver = await service.saveStep(USER_ID, 1, validBasics({ city: "Fort Worth" }));
      expect(driver.city).toBe("Fort Worth");
      expect(driver.onboardingStep).toBe(4);
      expect(driver.operatorTypes).toEqual(["cdl_driver"]);
      expect(driver.availability).toEqual(["full_time", "weekends"]);
    });

    it("a double submit that loses the insert race still saves", async () => {
      drivers.failNextCreateWith = AppError.conflict();
      const originalFind = drivers.findByProfileId.bind(drivers);
      let calls = 0;
      drivers.findByProfileId = async (profileId) => {
        calls += 1;
        // The first submit created the card between our lookup and our insert.
        if (calls === 2)
          drivers.rows.set(USER_ID, buildPartialDriver({ fullName: "First Submit" }));
        return originalFind(profileId);
      };

      const driver = await service.saveStep(USER_ID, 1, validBasics({ fullName: "Second Submit" }));
      expect(driver.fullName).toBe("Second Submit");
      expect(drivers.rows.size).toBe(1);
    });

    it("rethrows a create conflict when no card can be found afterwards", async () => {
      drivers.failNextCreateWith = AppError.conflict();
      const error = await expectAppError(service.saveStep(USER_ID, 1, validBasics()));
      expect(error.code).toBe("CONFLICT");
    });

    it("rethrows unexpected repository errors", async () => {
      drivers.failNextCreateWith = AppError.internal(new Error("db down"));
      const error = await expectAppError(service.saveStep(USER_ID, 1, validBasics()));
      expect(error.code).toBe("INTERNAL");
    });
  });

  describe("step order", () => {
    it.each([2, 3, 4, 5])("step %i cannot be saved before step 1", async (step) => {
      const error = await expectAppError(service.saveStep(USER_ID, step, {}));
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toBe("Start with the first step");
    });

    it.each([
      [1, 3],
      [1, 4],
      [1, 5],
      [2, 4],
      [2, 5],
      [3, 5],
    ])("after step %i, step %i cannot be skipped to", async (done, attempted) => {
      await completeSteps(done);
      const error = await expectAppError(
        service.saveStep(USER_ID, attempted, { consent: true, ...validAvailability() }),
      );
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toBe("Finish the earlier steps first");
      expect(drivers.rows.get(USER_ID)?.onboardingStep).toBe(done + 1);
    });

    it.each([0, 6, 7, -1, 2.5, Number.NaN])("rejects unknown step %s", async (step) => {
      const error = await expectAppError(service.saveStep(USER_ID, step, validBasics()));
      expect(error.code).toBe("VALIDATION");
      expect(error.message).toBe("Unknown onboarding step");
    });
  });

  describe("saveStep 2: role and licenses", () => {
    beforeEach(() => completeSteps(1));

    it("saves licenses and moves to step 3", async () => {
      const driver = await service.saveStep(USER_ID, 2, validLicenses());
      expect(driver).toMatchObject({
        operatorTypes: ["cdl_driver"],
        cdlClass: "A",
        endorsements: ["H", "T"],
        yearsExperience: 8,
        certifications: ["TWIC"],
        onboardingStep: 3,
      });
    });

    it("clears endorsements when the driver has no CDL", async () => {
      await service.saveStep(USER_ID, 2, validLicenses());
      const driver = await service.saveStep(
        USER_ID,
        2,
        validLicenses({ operatorTypes: ["mechanic"], cdlClass: "none", endorsements: ["H"] }),
      );
      expect(driver.cdlClass).toBe("none");
      expect(driver.endorsements).toEqual([]);
    });

    it("rejects invalid input and keeps the previous data", async () => {
      const error = await expectAppError(
        service.saveStep(USER_ID, 2, validLicenses({ operatorTypes: [], yearsExperience: 99 })),
      );
      expect(error.fieldErrors).toEqual({
        operatorTypes: "Select at least one role",
        yearsExperience: "Experience must be 60 years or less",
      });
      expect(drivers.rows.get(USER_ID)?.onboardingStep).toBe(2);
      expect(drivers.rows.get(USER_ID)?.operatorTypes).toEqual([]);
    });
  });

  describe("saveStep 3: availability", () => {
    beforeEach(() => completeSteps(2));

    it("saves availability and bio and moves to step 4", async () => {
      const driver = await service.saveStep(USER_ID, 3, validAvailability());
      expect(driver).toMatchObject({
        availability: ["full_time", "weekends"],
        bio: "Reliable and on time.",
        onboardingStep: 4,
      });
    });

    it("accepts an empty bio as null", async () => {
      const driver = await service.saveStep(USER_ID, 3, validAvailability({ bio: "" }));
      expect(driver.bio).toBeNull();
    });

    it("rejects a bio over 500 characters", async () => {
      const error = await expectAppError(
        service.saveStep(USER_ID, 3, validAvailability({ bio: "x".repeat(501) })),
      );
      expect(error.fieldErrors).toEqual({ bio: "Bio must be 500 characters or fewer" });
    });
  });

  describe("saveStep 4: documents (optional)", () => {
    it("can be skipped with no input and moves to step 5", async () => {
      await completeSteps(3);
      const driver = await service.saveStep(USER_ID, 4, undefined);
      expect(driver.onboardingStep).toBe(5);
      expect(driver.cardCompleted).toBe(false);
    });
  });

  describe("saveStep 5: SMS consent", () => {
    beforeEach(() => completeSteps(4));

    it("stores the exact consent text with a timestamp and completes the card", async () => {
      const driver = await service.saveStep(USER_ID, 5, { consent: true });
      expect(driver.smsOptIn).toBe(true);
      expect(driver.smsOptInText).toBe(SMS_CONSENT_TEXT);
      expect(driver.smsOptInText).toBe(
        "I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.",
      );
      expect(driver.smsOptInAt).toBe("2026-10-05T15:30:00.000Z");
      expect(driver.cardCompleted).toBe(true);
      expect(driver.onboardingStep).toBe(6);
    });

    it.each([{ consent: false }, {}, { consent: "true" }, undefined])(
      "cannot finish without consent (%j)",
      async (input) => {
        const error = await expectAppError(service.saveStep(USER_ID, 5, input));
        expect(error.code).toBe("VALIDATION");
        expect(error.fieldErrors).toEqual({
          consent: "You must agree to receive text messages to continue",
        });
        const saved = drivers.rows.get(USER_ID);
        expect(saved?.cardCompleted).toBe(false);
        expect(saved?.smsOptIn).toBe(false);
        expect(saved?.onboardingStep).toBe(5);
      },
    );

    it("submitting consent twice keeps the original timestamp and text", async () => {
      const first = await service.saveStep(USER_ID, 5, { consent: true });
      const later = new DriverService(drivers, profiles, () => new Date("2027-01-01T00:00:00Z"));
      const second = await later.saveStep(USER_ID, 5, { consent: true });
      expect(second.smsOptInAt).toBe(first.smsOptInAt);
      expect(second.smsOptInText).toBe(SMS_CONSENT_TEXT);
      expect(second.cardCompleted).toBe(true);
    });

    it("refuses to complete a card that is missing required fields", async () => {
      // Data went missing after the step was passed (for example an admin edit).
      drivers.rows.set(
        USER_ID,
        buildPartialDriver({ onboardingStep: 5, operatorTypes: [], availability: [] }),
      );
      const error = await expectAppError(service.saveStep(USER_ID, 5, { consent: true }));
      expect(error.code).toBe("VALIDATION");
      expect(error.fieldErrors).toEqual({
        operatorTypes: "Required",
        yearsExperience: "Required",
        availability: "Required",
      });
      expect(drivers.rows.get(USER_ID)?.cardCompleted).toBe(false);
      expect(drivers.rows.get(USER_ID)?.smsOptIn).toBe(false);
    });
  });

  describe("going back", () => {
    it("re-saving an earlier step after completion keeps the card complete", async () => {
      await completeSteps(5);
      const driver = await service.saveStep(USER_ID, 2, validLicenses({ yearsExperience: 12 }));
      expect(driver.yearsExperience).toBe(12);
      expect(driver.onboardingStep).toBe(6);
      expect(driver.cardCompleted).toBe(true);
      expect(driver.smsOptIn).toBe(true);
    });

    it("re-saving step 4 never moves progress backwards", async () => {
      await completeSteps(5);
      const driver = await service.saveStep(USER_ID, 4, undefined);
      expect(driver.onboardingStep).toBe(6);
    });
  });

  describe("updateCard (profile edit)", () => {
    it("requires an existing card", async () => {
      const error = await expectAppError(service.updateCard(USER_ID, validCard()));
      expect(error.code).toBe("NOT_FOUND");
    });

    it("updates every editable field and leaves consent and progress alone", async () => {
      await completeSteps(5);
      const driver = await service.updateCard(
        USER_ID,
        validCard({
          fullName: "Patricia Driver",
          city: "Austin",
          zip: "73301",
          serviceRadiusMiles: 120,
          operatorTypes: ["yard_spotter", "mechanic"],
          cdlClass: "B",
          endorsements: ["P"],
          yearsExperience: 15,
          certifications: ["Forklift"],
          availability: ["on_call"],
          bio: "",
        }),
      );
      expect(driver).toMatchObject({
        fullName: "Patricia Driver",
        city: "Austin",
        zip: "73301",
        serviceRadiusMiles: 120,
        operatorTypes: ["yard_spotter", "mechanic"],
        cdlClass: "B",
        endorsements: ["P"],
        yearsExperience: 15,
        certifications: ["Forklift"],
        availability: ["on_call"],
        bio: null,
        smsOptIn: true,
        smsOptInAt: "2026-10-05T15:30:00.000Z",
        cardCompleted: true,
        onboardingStep: 6,
      });
    });

    it("rejects invalid input and changes nothing", async () => {
      await completeSteps(5);
      const before = drivers.rows.get(USER_ID);
      const error = await expectAppError(
        service.updateCard(USER_ID, validCard({ availability: [], zip: "x" })),
      );
      expect(error.code).toBe("VALIDATION");
      expect(Object.keys(error.fieldErrors ?? {}).sort()).toEqual(["availability", "zip"]);
      expect(drivers.rows.get(USER_ID)).toEqual(before);
    });

    it("ignores attempts to set protected fields", async () => {
      await completeSteps(3);
      const driver = await service.updateCard(
        USER_ID,
        validCard({
          cardCompleted: true,
          smsOptIn: true,
          smsOptedOut: true,
          onboardingStep: 6,
          profileId: OTHER_USER_ID,
          status: "approved",
        }),
      );
      expect(driver.cardCompleted).toBe(false);
      expect(driver.smsOptIn).toBe(false);
      expect(driver.smsOptedOut).toBe(false);
      expect(driver.onboardingStep).toBe(4);
      expect(driver.profileId).toBe(USER_ID);
    });
  });

  describe("missingCardFields", () => {
    it("is empty for a complete card", () => {
      expect(missingCardFields(buildDriver())).toEqual([]);
    });

    it("lists each missing field with the step that collects it", () => {
      expect(missingCardFields(buildPartialDriver())).toEqual([
        { field: "operatorTypes", step: 2 },
        { field: "yearsExperience", step: 2 },
        { field: "availability", step: 3 },
      ]);
    });

    it("treats zero years of experience as provided", () => {
      expect(missingCardFields(buildDriver({ yearsExperience: 0 }))).toEqual([]);
    });
  });

  it("uses the real clock by default", async () => {
    const realClock = new DriverService(drivers, profiles);
    await completeSteps(4);
    const before = Date.now();
    const driver = await realClock.saveStep(USER_ID, 5, { consent: true });
    expect(new Date(driver.smsOptInAt!).getTime()).toBeGreaterThanOrEqual(before);
  });
});
