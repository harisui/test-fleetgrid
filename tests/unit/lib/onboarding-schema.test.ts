// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { SAVABLE_STEP_IDS } from "@/lib/onboarding/steps";
import {
  availabilityScreenSchema,
  bioScreenSchema,
  CDL_CONFLICT_MESSAGE,
  cdlClassScreenSchema,
  cdlClassScreenSchemaFor,
  certificationsScreenSchema,
  consentScreenSchema,
  distanceScreenSchema,
  documentsScreenSchema,
  endorsementsScreenSchema,
  experienceScreenSchema,
  hasCdlConflict,
  nameScreenSchema,
  normalizeZip,
  SCREEN_SCHEMAS,
  workTypeScreenSchema,
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

  it("accepts a ZIP in any forgiving form with an editable city and state", () => {
    expect(zipScreenSchema.parse({ zip: "60601-1234", city: " Chicago ", state: "il" })).toEqual({
      zip: "60601",
      city: "Chicago",
      state: "IL",
    });
    expect(zipScreenSchema.parse({ zip: "60601", state: "IL" }).city).toBeNull();
  });

  it.each([
    [{ zip: "6060", state: "IL" }, { zip: "Enter a 5-digit ZIP code, like 60601" }],
    [{ zip: "606011", state: "IL" }, { zip: "Enter a 5-digit ZIP code, like 60601" }],
    [{ zip: "", state: "IL" }, { zip: "Enter a 5-digit ZIP code, like 60601" }],
    [{ state: "IL" }, { zip: "Enter a 5-digit ZIP code, like 60601" }],
    [{ zip: "60601", state: "ZZ" }, { state: "Select your state" }],
    [{ zip: "60601" }, { state: "Select your state" }],
    [
      { zip: "60601", state: "IL", city: "x".repeat(81) },
      { city: "City must be 80 characters or fewer" },
    ],
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

describe("work type, experience, availability", () => {
  it("work type needs one or more kinds of work, without duplicates", () => {
    expect(workTypeScreenSchema.parse({ operatorTypes: ["mechanic", "mechanic"] })).toEqual({
      operatorTypes: ["mechanic"],
    });
    expect(errorsOf(workTypeScreenSchema, { operatorTypes: [] })).toEqual({
      operatorTypes: "Pick at least one kind of work",
    });
    expect(errorsOf(workTypeScreenSchema, {})).toEqual({
      operatorTypes: "Pick at least one kind of work",
    });
    expect(Object.keys(errorsOf(workTypeScreenSchema, { operatorTypes: ["pilot"] }))).toEqual([
      "operatorTypes.0",
    ]);
  });

  it("experience is a whole number from 0 to 60; blank is missing", () => {
    expect(experienceScreenSchema.parse({ yearsExperience: 0 })).toEqual({ yearsExperience: 0 });
    expect(experienceScreenSchema.parse({ yearsExperience: "12" })).toEqual({
      yearsExperience: 12,
    });
    expect(errorsOf(experienceScreenSchema, { yearsExperience: "" })).toEqual({
      yearsExperience: "Pick how many years you have done this work",
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

  it("availability needs one or more options", () => {
    expect(availabilityScreenSchema.parse({ availability: ["on_call", "on_call"] })).toEqual({
      availability: ["on_call"],
    });
    expect(errorsOf(availabilityScreenSchema, { availability: [] })).toEqual({
      availability: "Pick at least one option",
    });
  });
});

describe("CDL class and the conflict rule", () => {
  it("accepts any class", () => {
    for (const cdlClass of ["A", "B", "C", "none"]) {
      expect(cdlClassScreenSchema.parse({ cdlClass })).toEqual({ cdlClass });
    }
    expect(errorsOf(cdlClassScreenSchema, { cdlClass: "D" })).toEqual({
      cdlClass: "Pick your CDL class",
    });
    expect(errorsOf(cdlClassScreenSchema, {})).toEqual({ cdlClass: "Pick your CDL class" });
  });

  it("hasCdlConflict only for CDL driver work with No CDL", () => {
    expect(hasCdlConflict(["cdl_driver"], "none")).toBe(true);
    expect(hasCdlConflict(["cdl_driver", "mechanic"], "none")).toBe(true);
    expect(hasCdlConflict(["cdl_driver"], "A")).toBe(false);
    expect(hasCdlConflict(["mechanic"], "none")).toBe(false);
    expect(hasCdlConflict(["cdl_driver"], null)).toBe(false);
    expect(hasCdlConflict(["cdl_driver"], undefined)).toBe(false);
  });

  it("the screen schema blocks the conflict with the approved message", () => {
    const schema = cdlClassScreenSchemaFor(["cdl_driver"]);
    expect(errorsOf(schema, { cdlClass: "none" })).toEqual({ cdlClass: CDL_CONFLICT_MESSAGE });
    expect(schema.parse({ cdlClass: "B" })).toEqual({ cdlClass: "B" });
    expect(cdlClassScreenSchemaFor(["yard_spotter"]).parse({ cdlClass: "none" })).toEqual({
      cdlClass: "none",
    });
  });
});

describe("endorsements and certifications", () => {
  it("endorsements apply the X rule and default to empty", () => {
    expect(endorsementsScreenSchema.parse({ endorsements: ["X"] })).toEqual({
      endorsements: ["X", "H", "N"],
    });
    expect(endorsementsScreenSchema.parse({})).toEqual({ endorsements: [] });
    expect(Object.keys(errorsOf(endorsementsScreenSchema, { endorsements: ["Z"] }))).toEqual([
      "endorsements.0",
    ]);
  });

  it("certifications trim, drop duplicates and cap at 20", () => {
    expect(
      certificationsScreenSchema.parse({ certifications: [" TWIC ", "twic", "OSHA 10"] }),
    ).toEqual({ certifications: ["TWIC", "OSHA 10"] });
    expect(certificationsScreenSchema.parse({})).toEqual({ certifications: [] });
    expect(errorsOf(certificationsScreenSchema, { certifications: [" "] })).toEqual({
      "certifications.0": "A certification cannot be blank",
    });
    expect(errorsOf(certificationsScreenSchema, { certifications: ["x".repeat(61)] })).toEqual({
      "certifications.0": "Each certification must be 60 characters or fewer",
    });
    expect(
      errorsOf(certificationsScreenSchema, {
        certifications: Array.from({ length: 21 }, (_, i) => `Cert ${i}`),
      }),
    ).toEqual({ certifications: "Add up to 20 certifications" });
  });
});

describe("papers, bio and consent", () => {
  it("papers take no input", () => {
    expect(documentsScreenSchema.parse({})).toEqual({});
  });

  it("bio is optional, trimmed and capped at 500", () => {
    expect(bioScreenSchema.parse({ bio: "  hi " })).toEqual({ bio: "hi" });
    expect(bioScreenSchema.parse({ bio: "" })).toEqual({ bio: null });
    expect(bioScreenSchema.parse({})).toEqual({ bio: null });
    expect(errorsOf(bioScreenSchema, { bio: "x".repeat(501) })).toEqual({
      bio: "Keep it to 500 characters or fewer",
    });
  });

  it("consent accepts only an explicit true", () => {
    expect(consentScreenSchema.parse({ consent: true })).toEqual({ consent: true });
    for (const consent of [false, undefined, null, "true", "on", 1]) {
      expect(errorsOf(consentScreenSchema, { consent })).toEqual({
        consent: "Tap the box to agree before you finish",
      });
    }
  });
});
