// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { SAVABLE_STEP_IDS } from "@/lib/onboarding/steps";
import {
  CDL_CLASS_MESSAGE,
  cdlClassScreenSchema,
  consentScreenSchema,
  credentialsScreenSchema,
  distanceScreenSchema,
  endorsementsScreenSchema,
  EQUIPMENT_MESSAGE,
  equipmentScreenSchema,
  experienceScreenSchema,
  MEDICAL_CARD_MESSAGE,
  MVR_MESSAGE,
  nameScreenSchema,
  normalizeZip,
  recordScreenSchema,
  SCREEN_SCHEMAS,
  TRANSMISSION_MESSAGE,
  transmissionScreenSchema,
  TWIC_MESSAGE,
  zipScreenSchema,
} from "@/lib/validation/onboarding.schema";
import { SCREEN_INPUTS } from "../../setup/factories";

/** Returns { field: firstMessage } for a failed parse. */
function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) throw new Error(`expected ${JSON.stringify(input)} to be rejected`);
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) errors[issue.path.join(".") || "form"] ??= issue.message;
  return errors;
}

describe("SCREEN_SCHEMAS", () => {
  it("has one schema per savable screen and each accepts its valid input", () => {
    expect(Object.keys(SCREEN_SCHEMAS).sort()).toEqual([...SAVABLE_STEP_IDS].sort());
    for (const stepId of SAVABLE_STEP_IDS) {
      expect(SCREEN_SCHEMAS[stepId].safeParse(SCREEN_INPUTS[stepId]).success, stepId).toBe(true);
    }
  });
});

describe("name", () => {
  it("trims and requires at least two characters", () => {
    expect(nameScreenSchema.parse({ fullName: "  Pat Driver " })).toEqual({
      fullName: "Pat Driver",
    });
    expect(errorsOf(nameScreenSchema, { fullName: " P " })).toEqual({
      fullName: "Enter your name",
    });
    expect(errorsOf(nameScreenSchema, {})).toEqual({ fullName: "Enter your name" });
    expect(errorsOf(nameScreenSchema, { fullName: "x".repeat(101) })).toEqual({
      fullName: "Name must be 100 characters or fewer",
    });
  });
});

describe("zip", () => {
  it.each([
    ["60601", "60601"],
    ["60601-1234", "60601"],
    ["60601 1234", "60601"],
    [" 606 01 ", "60601"],
    [60601, 60601],
    [null, null],
  ])("normalizeZip(%j) is %j", (input, expected) => {
    expect(normalizeZip(input)).toBe(expected);
  });

  it("accepts a ZIP in any forgiving form, and nothing else: city and state come from the dataset", () => {
    expect(zipScreenSchema.parse({ zip: "60601-1234" })).toEqual({ zip: "60601" });
    expect(zipScreenSchema.parse({ zip: "60601", city: "Typed", state: "ZZ" })).toEqual({
      zip: "60601",
    });
  });

  it.each([
    [{ zip: "6060" }, { zip: "Enter a 5-digit ZIP code, like 60601" }],
    [{ zip: "606011" }, { zip: "Enter a 5-digit ZIP code, like 60601" }],
    [{ zip: "" }, { zip: "Enter a 5-digit ZIP code, like 60601" }],
    [{}, { zip: "Enter a 5-digit ZIP code, like 60601" }],
  ])("rejects %j", (input, expected) => {
    expect(errorsOf(zipScreenSchema, input)).toEqual(expected);
  });
});

describe("distance", () => {
  it("accepts chip values and typed numbers", () => {
    expect(distanceScreenSchema.parse({ serviceRadiusMiles: 250 })).toEqual({
      serviceRadiusMiles: 250,
    });
    expect(distanceScreenSchema.parse({ serviceRadiusMiles: "25" })).toEqual({
      serviceRadiusMiles: 25,
    });
  });

  it.each([
    [{}, "Pick how far you will travel"],
    [{ serviceRadiusMiles: "" }, "Pick how far you will travel"],
    [{ serviceRadiusMiles: null }, "Pick how far you will travel"],
    [{ serviceRadiusMiles: 4 }, "Distance must be at least 5 miles"],
    [{ serviceRadiusMiles: 501 }, "Distance must be 500 miles or less"],
    [{ serviceRadiusMiles: 10.5 }, "Enter a whole number"],
  ])("rejects %j", (input, message) => {
    expect(errorsOf(distanceScreenSchema, input)).toEqual({ serviceRadiusMiles: message });
  });
});

describe("CDL class, experience, record", () => {
  it("the class is A, B or C: no No CDL, since FleetGrid lists CDL drivers only", () => {
    for (const cdlClass of ["A", "B", "C"]) {
      expect(cdlClassScreenSchema.parse({ cdlClass })).toEqual({ cdlClass });
    }
    for (const cdlClass of ["none", "D", null, undefined]) {
      expect(errorsOf(cdlClassScreenSchema, { cdlClass })).toEqual({ cdlClass: CDL_CLASS_MESSAGE });
    }
    expect(CDL_CLASS_MESSAGE).toBe("Pick your CDL class");
  });

  it("experience is a whole number from 0 to 60; blank is missing", () => {
    expect(experienceScreenSchema.parse({ yearsExperience: 0 })).toEqual({ yearsExperience: 0 });
    expect(experienceScreenSchema.parse({ yearsExperience: "12" })).toEqual({
      yearsExperience: 12,
    });
    expect(errorsOf(experienceScreenSchema, { yearsExperience: "" })).toEqual({
      yearsExperience: "Pick how many years you have driven",
    });
    expect(errorsOf(experienceScreenSchema, { yearsExperience: -1 })).toEqual({
      yearsExperience: "Years cannot be negative",
    });
    expect(errorsOf(experienceScreenSchema, { yearsExperience: 61 })).toEqual({
      yearsExperience: "Years must be 60 or less",
    });
    expect(errorsOf(experienceScreenSchema, { yearsExperience: 2.5 })).toEqual({
      yearsExperience: "Enter a whole number",
    });
  });

  it("the record is one of the three MVR levels", () => {
    for (const mvrStatus of ["clean", "minor_1_2", "major_3_plus"]) {
      expect(recordScreenSchema.parse({ mvrStatus })).toEqual({ mvrStatus });
    }
    expect(errorsOf(recordScreenSchema, {})).toEqual({ mvrStatus: MVR_MESSAGE });
    for (const mvrStatus of [true, "none", "dirty", null]) {
      expect(errorsOf(recordScreenSchema, { mvrStatus })).toEqual({ mvrStatus: MVR_MESSAGE });
    }
  });
});

describe("cards", () => {
  it("the cards screen takes two real yes-or-no answers", () => {
    expect(credentialsScreenSchema.parse({ twicActive: true, medicalCardActive: false })).toEqual({
      twicActive: true,
      medicalCardActive: false,
    });
    expect(errorsOf(credentialsScreenSchema, {})).toEqual({
      twicActive: TWIC_MESSAGE,
      medicalCardActive: MEDICAL_CARD_MESSAGE,
    });
    for (const twicActive of ["true", 1, null, "yes"]) {
      expect(errorsOf(credentialsScreenSchema, { twicActive, medicalCardActive: true })).toEqual({
        twicActive: TWIC_MESSAGE,
      });
    }
  });
});

describe("letters: endorsements and transmission", () => {
  it("endorsements apply the X rule and default to empty", () => {
    expect(endorsementsScreenSchema.parse({ endorsements: ["X"] })).toEqual({
      endorsements: ["X", "H", "N"],
    });
    expect(endorsementsScreenSchema.parse({})).toEqual({ endorsements: [] });
    // S is never stored without P.
    expect(endorsementsScreenSchema.parse({ endorsements: ["S"] })).toEqual({
      endorsements: ["P", "S"],
    });
    expect(Object.keys(errorsOf(endorsementsScreenSchema, { endorsements: ["Z"] }))).toEqual([
      "endorsements.0",
    ]);
  });

  it("transmission is automatic only, or automatic and manual", () => {
    for (const transmission of ["automatic_only", "manual_ok"]) {
      expect(transmissionScreenSchema.parse({ transmission })).toEqual({ transmission });
    }
    expect(errorsOf(transmissionScreenSchema, {})).toEqual({ transmission: TRANSMISSION_MESSAGE });
    expect(errorsOf(transmissionScreenSchema, { transmission: "stick" })).toEqual({
      transmission: TRANSMISSION_MESSAGE,
    });
  });
});

describe("equipment", () => {
  it("needs one or more kinds, without duplicates", () => {
    expect(equipmentScreenSchema.parse({ equipmentTypes: ["reefer", "reefer", "flatbed"] })).toEqual(
      { equipmentTypes: ["reefer", "flatbed"] },
    );
    expect(errorsOf(equipmentScreenSchema, { equipmentTypes: [] })).toEqual({
      equipmentTypes: EQUIPMENT_MESSAGE,
    });
    expect(errorsOf(equipmentScreenSchema, {})).toEqual({ equipmentTypes: EQUIPMENT_MESSAGE });
    expect(Object.keys(errorsOf(equipmentScreenSchema, { equipmentTypes: ["tank"] }))).toEqual([
      "equipmentTypes.0",
    ]);
  });
});

describe("consent", () => {
  it("accepts only an explicit true", () => {
    expect(consentScreenSchema.parse({ consent: true })).toEqual({ consent: true });
    for (const consent of [false, undefined, null, "true", "on", 1]) {
      expect(errorsOf(consentScreenSchema, { consent })).toEqual({
        consent: "Tap the box to agree before you finish",
      });
    }
  });
});
