import { SMS_CONSENT_TEXT } from "@/lib/constants";
import type { DriverDocument, LocatedDriver, Profile } from "@/types/domain";

/**
 * Test data builders. Each builder returns a valid object and accepts overrides.
 */

/** Phone numbers with fixed OTP "123456" in supabase/config.toml. Never real numbers. */
export const TEST_PHONES = {
  driver: "+15555550100",
  carrier: "+15555550101",
  admin: "+15555550102",
  extra: [
    "+15555550103",
    "+15555550104",
    "+15555550105",
    "+15555550106",
    "+15555550107",
    "+15555550108",
    "+15555550109",
  ],
} as const;

export const TEST_OTP = "123456";

let sequence = 0;

/** Monotonic counter for unique values inside one test run. */
export function nextSequence(): number {
  sequence += 1;
  return sequence;
}

// Suffixes 2000 to 9999: clear of the test OTP numbers (01xx) and the seeded drivers (10xx).
const PHONE_RANGE_START = 2000;
const PHONE_RANGE_SIZE = 8000;
const phoneOffset = Math.floor(Math.random() * PHONE_RANGE_SIZE);

/** A unique fake E.164 number in the reserved +1555555xxxx range. */
export function buildPhone(): string {
  const suffix = PHONE_RANGE_START + ((phoneOffset + nextSequence()) % PHONE_RANGE_SIZE);
  return `+1555555${suffix}`;
}

/** Generic builder: merges overrides over defaults. */
export function build<T extends object>(defaults: T, overrides: Partial<T> = {}): T {
  return { ...defaults, ...overrides };
}

// ---------------------------------------------------------------------------
// Domain builders
// ---------------------------------------------------------------------------

const TIMESTAMP = "2026-10-01T12:00:00.000Z";

export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
export const DRIVER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const OTHER_DRIVER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export function buildProfile(overrides: Partial<Profile> = {}): Profile {
  return build<Profile>(
    {
      id: USER_ID,
      role: "driver",
      phone: TEST_PHONES.driver,
      status: "pending",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
    overrides,
  );
}

/** A completed qualification card inside the launch area. Override fields to build partial cards. */
export function buildDriver(overrides: Partial<LocatedDriver> = {}): LocatedDriver {
  return build<LocatedDriver>(
    {
      id: DRIVER_ID,
      profileId: USER_ID,
      fullName: "Pat Driver",
      operatorTypes: ["cdl_driver"],
      cdlClass: "A",
      endorsements: ["H", "T"],
      yearsExperience: 8,
      city: "Dallas",
      state: "TX",
      zip: "75201",
      serviceRadiusMiles: 50,
      lat: 32.78111,
      lng: -96.79722,
      availability: ["full_time"],
      certifications: ["OSHA 10"],
      bio: "Reliable and on time.",
      employmentType: "w2",
      drivingStyles: ["local_day_cab", "regional"],
      transmission: "manual_ok",
      equipmentTypes: ["dry_van", "flatbed"],
      twicActive: true,
      medicalCardActive: true,
      clearinghouseRegistered: true,
      mvrStatus: "clean",
      smsOptIn: true,
      smsOptInAt: TIMESTAMP,
      smsOptInText: SMS_CONSENT_TEXT,
      smsOptedOut: false,
      smsOptedOutAt: null,
      onboardingStep: 12,
      cardCompleted: true,
      inServiceArea: true,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
    overrides,
  );
}

/** The card as it looks right after the name screen is saved: a CDL driver with a name. */
export function buildPartialDriver(overrides: Partial<LocatedDriver> = {}): LocatedDriver {
  return buildDriver({
    operatorTypes: ["cdl_driver"],
    cdlClass: "none",
    endorsements: [],
    yearsExperience: null,
    city: null,
    state: null,
    zip: null,
    lat: null,
    lng: null,
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
    onboardingStep: 2,
    cardCompleted: false,
    inServiceArea: null,
    ...overrides,
  });
}

/** Valid raw input for each onboarding screen, in flow order. */
export const SCREEN_INPUTS = {
  name: { fullName: "Pat Driver" },
  zip: { zip: "75201" },
  distance: { serviceRadiusMiles: 50 },
  cdlClass: { cdlClass: "A" },
  experience: { yearsExperience: 8 },
  record: { mvrStatus: "clean" },
  credentials: { twicActive: true, medicalCardActive: true },
  endorsements: { endorsements: ["H", "T"] },
  transmission: { transmission: "manual_ok" },
  equipment: { equipmentTypes: ["dry_van", "flatbed"] },
  consent: { consent: true },
} as const;

export function buildDocument(overrides: Partial<DriverDocument> = {}): DriverDocument {
  return build<DriverDocument>(
    {
      id: "d0000000-0000-4000-8000-000000000001",
      driverId: DRIVER_ID,
      type: "cdl_front",
      storagePath: `${DRIVER_ID}/c0000000-0000-4000-8000-000000000001.jpg`,
      fileName: "cdl-front.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 250_000,
      createdAt: TIMESTAMP,
    },
    overrides,
  );
}

/** Valid raw form input for each onboarding step. */
export const validBasics = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Pat Driver",
  zip: "75201",
  serviceRadiusMiles: 50,
  ...overrides,
});

export const validLicenses = (overrides: Record<string, unknown> = {}) => ({
  employmentType: "w2",
  cdlClass: "A",
  endorsements: ["H", "T"],
  yearsExperience: 8,
  certifications: ["OSHA 10"],
  ...overrides,
});

/** The equipment and record answers. */
export const validChecks = (overrides: Record<string, unknown> = {}) => ({
  drivingStyles: ["local_day_cab", "regional"],
  transmission: "manual_ok",
  equipmentTypes: ["dry_van", "flatbed"],
  twicActive: true,
  medicalCardActive: true,
  clearinghouseRegistered: true,
  mvrStatus: "clean",
  ...overrides,
});

export const validAvailability = (overrides: Record<string, unknown> = {}) => ({
  availability: ["full_time", "weekends"],
  bio: "Reliable and on time.",
  ...overrides,
});

export const validCard = (overrides: Record<string, unknown> = {}) => ({
  ...validBasics(),
  ...validLicenses(),
  ...validChecks(),
  ...validAvailability(),
  ...overrides,
});
