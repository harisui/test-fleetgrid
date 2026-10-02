/**
 * Test data builders. Each builder returns a valid object and accepts overrides.
 * Domain builders (profile, driver, document) are added with the domain types in T1.6.
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
