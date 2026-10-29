import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SMS_CONSENT_TEXT } from "@/lib/constants";
import { AppError } from "@/server/errors/AppError";
import { DriverRepository } from "@/server/repositories/DriverRepository";
import {
  cleanupTestUsers,
  createTestDriver,
  createTestUser,
  serviceClient,
  type TestDriver,
  type TestUser,
} from "../../setup/supabase";

async function expectAppError(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const basics = {
  fullName: "Pat Driver",
  city: "Dallas",
  state: "TX",
  zip: "75201",
  serviceRadiusMiles: 75,
  onboardingStep: 2,
};

describe("DriverRepository (local Supabase)", () => {
  let driver: TestUser;
  let otherDriver: TestDriver;
  let carrier: TestUser;
  let repository: DriverRepository;

  beforeAll(async () => {
    [driver, otherDriver, carrier] = await Promise.all([
      createTestUser({ role: "driver" }),
      createTestDriver({ fullName: "Other Driver" }),
      createTestUser({ role: "carrier" }),
    ]);
    repository = new DriverRepository(driver.client);
  });

  afterAll(cleanupTestUsers);

  it("findByProfileId returns null before the card exists", async () => {
    await expect(repository.findByProfileId(driver.id)).resolves.toBeNull();
  });

  it("create stores step 1 and applies database defaults", async () => {
    const created = await repository.create(driver.id, basics);
    expect(created).toMatchObject({
      profileId: driver.id,
      fullName: "Pat Driver",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      serviceRadiusMiles: 75,
      onboardingStep: 2,
      operatorTypes: [],
      cdlClass: "none",
      endorsements: [],
      yearsExperience: null,
      availability: [],
      certifications: [],
      bio: null,
      employmentType: null,
      drivingStyles: [],
      transmission: null,
      equipmentTypes: [],
      twicActive: null,
      medicalCardActive: null,
      clearinghouseRegistered: null,
      mvrStatus: null,
      smsOptIn: false,
      smsOptInAt: null,
      smsOptInText: null,
      smsOptedOut: false,
      smsOptedOutAt: null,
      cardCompleted: false,
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("create stores the lead's class, coordinates and consent in the one insert", async () => {
    const lead = await createTestUser({ role: "driver" });
    const created = await new DriverRepository(lead.client).create(lead.id, {
      ...basics,
      operatorTypes: ["cdl_driver"],
      lat: 32.78111,
      lng: -96.79722,
      cdlClass: "B",
      smsOptIn: true,
      smsOptInAt: "2026-10-05T15:30:00.000Z",
      smsOptInText: SMS_CONSENT_TEXT,
    });
    expect(created).toMatchObject({
      cdlClass: "B",
      lat: 32.78111,
      lng: -96.79722,
      smsOptIn: true,
      smsOptInText: SMS_CONSENT_TEXT,
      cardCompleted: false,
      onboardingStep: 2,
    });
    expect(new Date(created.smsOptInAt!).toISOString()).toBe("2026-10-05T15:30:00.000Z");
  });

  it("findByProfileId returns the saved card", async () => {
    const found = await repository.findByProfileId(driver.id);
    expect(found?.fullName).toBe("Pat Driver");
    expect(found?.profileId).toBe(driver.id);
  });

  it("create maps a second card to CONFLICT", async () => {
    const error = await expectAppError(repository.create(driver.id, basics));
    expect(error.code).toBe("CONFLICT");
  });

  it("update changes only the given fields", async () => {
    const updated = await repository.update(driver.id, {
      operatorTypes: ["cdl_driver", "mechanic"],
      cdlClass: "A",
      endorsements: ["H", "X"],
      yearsExperience: 12,
      certifications: ["TWIC"],
      onboardingStep: 3,
    });
    expect(updated).toMatchObject({
      fullName: "Pat Driver",
      zip: "75201",
      operatorTypes: ["cdl_driver", "mechanic"],
      cdlClass: "A",
      endorsements: ["H", "X"],
      yearsExperience: 12,
      certifications: ["TWIC"],
      onboardingStep: 3,
    });
  });

  it("update stores the ZIP's coordinates as a pair and can clear them", async () => {
    const located = await repository.update(driver.id, { lat: 32.78111, lng: -96.79722 });
    expect(located.lat).toBeCloseTo(32.78111, 5);
    expect(located.lng).toBeCloseTo(-96.79722, 5);

    const error = await repository.update(driver.id, { lat: 32.78111, lng: null }).catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("VALIDATION");

    const cleared = await repository.update(driver.id, { lat: null, lng: null });
    expect(cleared.lat).toBeNull();
    expect(cleared.lng).toBeNull();
  });

  it("update stores the employment, equipment and check answers and maps them back", async () => {
    const updated = await repository.update(driver.id, {
      employmentType: "contractor_1099",
      drivingStyles: ["local_day_cab", "regional"],
      transmission: "automatic_only",
      equipmentTypes: ["container_drayage", "reefer"],
      twicActive: true,
      medicalCardActive: false,
      clearinghouseRegistered: true,
      mvrStatus: "minor_1_2",
    });
    expect(updated).toMatchObject({
      employmentType: "contractor_1099",
      drivingStyles: ["local_day_cab", "regional"],
      transmission: "automatic_only",
      equipmentTypes: ["container_drayage", "reefer"],
      twicActive: true,
      medicalCardActive: false,
      clearinghouseRegistered: true,
      mvrStatus: "minor_1_2",
    });
  });

  it("the Clearinghouse and SAP self-report: a yes with the database's time, read back with the card, withdrawn, given again", async () => {
    const card = (await repository.findByProfileId(driver.id))!;
    expect(card.clearinghouseSelfReportedAt).toBeNull();
    await repository.setClearinghouseSelfReport(card.id, true);
    const first = (await repository.findByProfileId(driver.id))!.clearinghouseSelfReportedAt;
    expect(first).not.toBeNull();
    expect(Math.abs(Date.parse(first!) - Date.now())).toBeLessThan(60_000);
    // update() returns the answer too.
    expect((await repository.update(driver.id, { onboardingStep: card.onboardingStep })).clearinghouseSelfReportedAt).toBe(first);

    await repository.setClearinghouseSelfReport(card.id, false);
    expect((await repository.findByProfileId(driver.id))!.clearinghouseSelfReportedAt).toBeNull();
    const { count } = await serviceClient()
      .from("driver_clearinghouse_self_reports")
      .select("driver_id", { count: "exact", head: true })
      .eq("driver_id", card.id);
    expect(count).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await repository.setClearinghouseSelfReport(card.id, true);
    const again = (await repository.findByProfileId(driver.id))!.clearinghouseSelfReportedAt;
    expect(Date.parse(again!)).toBeGreaterThan(Date.parse(first!));
    await repository.setClearinghouseSelfReport(card.id, true);
    expect(Date.parse((await repository.findByProfileId(driver.id))!.clearinghouseSelfReportedAt!)).toBeGreaterThanOrEqual(Date.parse(again!));
    await repository.setClearinghouseSelfReport(card.id, false);
  });

  it("another driver cannot write a self-report on this card", async () => {
    const card = (await repository.findByProfileId(driver.id))!;
    const error = await expectAppError(new DriverRepository(otherDriver.client).setClearinghouseSelfReport(card.id, true));
    expect(error.code).toBe("FORBIDDEN");
  });

  it("update can clear nullable fields and store consent with completion", async () => {
    await repository.update(driver.id, { availability: ["full_time"], bio: "Hello", city: null });
    const consentAt = "2026-10-05T15:30:00.000Z";
    const updated = await repository.update(driver.id, {
      bio: null,
      smsOptIn: true,
      smsOptInAt: consentAt,
      smsOptInText: SMS_CONSENT_TEXT,
      onboardingStep: 11,
      cardCompleted: true,
    });
    expect(updated.bio).toBeNull();
    expect(updated.city).toBeNull();
    expect(updated.smsOptIn).toBe(true);
    expect(updated.smsOptInText).toBe(SMS_CONSENT_TEXT);
    expect(new Date(updated.smsOptInAt!).toISOString()).toBe(consentAt);
    expect(updated.cardCompleted).toBe(true);

    // Every field is correct in the database itself.
    const { data } = await serviceClient()
      .from("drivers")
      .select("*")
      .eq("profile_id", driver.id)
      .single();
    expect(data).toMatchObject({
      full_name: "Pat Driver",
      operator_types: ["cdl_driver", "mechanic"],
      cdl_class: "A",
      endorsements: ["H", "X"],
      years_experience: 12,
      availability: ["full_time"],
      employment_type: "contractor_1099",
      driving_styles: ["local_day_cab", "regional"],
      transmission: "automatic_only",
      equipment_types: ["container_drayage", "reefer"],
      twic_active: true,
      medical_card_active: false,
      clearinghouse_registered: true,
      mvr_status: "minor_1_2",
      sms_opt_in: true,
      sms_opt_in_text: SMS_CONSENT_TEXT,
      onboarding_step: 11,
      card_completed: true,
    });
  });

  it("update maps a completed CDL driver card losing a check to VALIDATION", async () => {
    const error = await expectAppError(repository.update(driver.id, { mvrStatus: null }));
    expect(error.code).toBe("VALIDATION");
  });

  it("update maps a database check violation to VALIDATION without leaking it", async () => {
    const error = await expectAppError(repository.update(driver.id, { zip: "bad" }));
    expect(error.code).toBe("VALIDATION");
    expect(error.message).not.toMatch(/constraint|drivers_zip_format/);
  });

  it("update maps completing an incomplete card to VALIDATION", async () => {
    const partial = await createTestDriver();
    const partialRepository = new DriverRepository(partial.client);
    const error = await expectAppError(
      partialRepository.update(partial.id, { cardCompleted: true }),
    );
    expect(error.code).toBe("VALIDATION");
  });

  it("update on another driver's card finds nothing (RLS) and reports NOT_FOUND", async () => {
    const error = await expectAppError(repository.update(otherDriver.id, { fullName: "Hacked" }));
    expect(error.code).toBe("NOT_FOUND");

    const { data } = await serviceClient()
      .from("drivers")
      .select("full_name")
      .eq("id", otherDriver.driverId)
      .single();
    expect(data?.full_name).toBe("Other Driver");
  });

  it("findByProfileId cannot see another driver's card", async () => {
    await expect(repository.findByProfileId(otherDriver.id)).resolves.toBeNull();
  });

  it("create is FORBIDDEN for a carrier", async () => {
    const carrierRepository = new DriverRepository(carrier.client);
    const error = await expectAppError(carrierRepository.create(carrier.id, basics));
    expect(error.code).toBe("FORBIDDEN");
  });
});
