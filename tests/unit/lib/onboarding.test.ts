// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CARD_CHECKS,
  CDL_CLASS_OPTIONS,
  DRIVING_STYLE_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  ENDORSEMENT_OPTIONS,
  EQUIPMENT_CHIPS,
  EXPERIENCE_CHIPS,
  MVR_CHIPS,
  MVR_HELPER,
  MVR_QUESTION,
  MVR_SUMMARY,
  experienceChipFor,
  normalizeEndorsements,
  ONBOARDING_DOCUMENT_TILES,
  toggleEndorsement,
  TRANSMISSION_OPTIONS,
  AVAILABILITY_OPTIONS,
  DISTANCE_CHIPS,
} from "@/lib/onboarding/options";
import {
  DONE_STEP_NUMBER,
  isSavableStepId,
  isStepId,
  MILE_SUMMARIES,
  MILES,
  nextStepId,
  previousStepId,
  progressFor,
  SAVABLE_STEP_IDS,
  stepById,
  stepByNumber,
  stepNumber,
  STEPS,
  stepsOfMile,
} from "@/lib/onboarding/steps";
import {
  CDL_HELD_CLASSES,
  DRIVING_STYLES,
  EMPLOYMENT_TYPES,
  ENDORSEMENTS,
  EQUIPMENT_TYPES,
  MVR_STATUSES,
  TRANSMISSION_TYPES,
} from "@/types/domain";

describe("steps config", () => {
  it("has six miles labelled About, CDL, Cards, Letters, Equipment, Finish", () => {
    expect(MILES.map((mile) => `${mile.mile} ${mile.label}`)).toEqual([
      "1 About",
      "2 CDL",
      "3 Cards",
      "4 Letters",
      "5 Equipment",
      "6 Finish",
    ]);
    expect(Object.keys(MILE_SUMMARIES).map(Number)).toEqual(MILES.map((mile) => mile.mile));
  });

  it("has twelve screens in the client's order (2026-10-09) and mile map", () => {
    expect(STEPS.map((step) => `${step.mile}:${step.id}`)).toEqual([
      "1:name",
      "1:zip",
      "1:distance",
      "2:cdlClass",
      "2:experience",
      "2:record",
      "3:credentials",
      "4:endorsements",
      "4:transmission",
      "5:equipment",
      "6:consent",
      "6:done",
    ]);
    expect(DONE_STEP_NUMBER).toBe(12);
    expect(SAVABLE_STEP_IDS).toHaveLength(11);
    expect(SAVABLE_STEP_IDS).not.toContain("done");
  });

  it("no longer asks work type, W-2 or 1099, driving style, availability, certifications, papers, the Clearinghouse or about you", () => {
    const ids = STEPS.map((step) => step.id as string);
    for (const gone of [
      "workType",
      "employmentType",
      "drivingStyle",
      "availability",
      "certifications",
      "documents",
      "compliance",
      "bio",
    ]) {
      expect(ids, gone).not.toContain(gone);
    }
  });

  it("every sign header is a question, except the done screen", () => {
    for (const step of STEPS) {
      if (step.id === "done") expect(step.question).toBe("You are listed.");
      else expect(step.question.endsWith("?"), step.id).toBe(true);
    }
  });

  it("uses the approved copy", () => {
    expect(stepById("endorsements")).toMatchObject({
      question: "Any extra letters on your CDL?",
      helper: "These are called endorsements. They're printed next to END on the front.",
    });
    expect(stepById("consent").question).toBe("Can we text you about shifts?");
    expect(stepById("name").question).toBe("What is your name?");
    expect(stepById("cdlClass").question).toBe("What class is your CDL?");
    expect(stepById("experience").question).toBe("How many years have you driven with a CDL?");
    expect(stepById("record").question).toBe(MVR_QUESTION);
    expect(stepById("credentials").question).toBe("Do you have these cards?");
    expect(stepById("transmission").question).toBe("Can you drive a manual?");
    expect(stepById("equipment").question).toBe("What equipment do you run?");
  });

  it("numbers steps from 1 and looks them up both ways", () => {
    expect(stepNumber("name")).toBe(1);
    expect(stepNumber("done")).toBe(12);
    expect(stepByNumber(4).id).toBe("cdlClass");
    expect(() => stepByNumber(0)).toThrow(/Unknown onboarding step/);
    expect(() => stepByNumber(13)).toThrow(/Unknown onboarding step/);
    expect(() => stepByNumber(1.5)).toThrow(/Unknown onboarding step/);
    expect(() => stepById("nope" as never)).toThrow(/Unknown onboarding step/);
  });

  it("recognises step ids", () => {
    expect(isStepId("zip")).toBe(true);
    expect(isStepId("done")).toBe(true);
    expect(isStepId("workType")).toBe(false);
    expect(isStepId(1)).toBe(false);
    expect(isSavableStepId("done")).toBe(false);
    expect(isSavableStepId("consent")).toBe(true);
    expect(isSavableStepId("record")).toBe(true);
  });
});

describe("progressFor", () => {
  it("derives the eyebrow, screen-reader label and truck position from the config", () => {
    expect(progressFor("cdlClass")).toMatchObject({
      number: 4,
      mile: { mile: 2, label: "CDL" },
      percent: 27,
      eyebrow: "Mile 2 of 6",
      srLabel: "Step 2 of 6: CDL",
      completedMiles: [1],
    });
    expect(progressFor("name")).toMatchObject({ percent: 0, completedMiles: [] });
    expect(progressFor("done")).toMatchObject({ percent: 100, completedMiles: [1, 2, 3, 4, 5] });
  });

  it("moves the truck forward on every screen", () => {
    const percents = STEPS.map((step) => progressFor(step.id).percent);
    for (let index = 1; index < percents.length; index += 1) {
      expect(percents[index]).toBeGreaterThan(percents[index - 1]);
    }
  });
});

describe("flow navigation", () => {
  it("walks the screens in order, forwards and backwards", () => {
    expect(nextStepId("name")).toBe("zip");
    expect(nextStepId("distance")).toBe("cdlClass");
    expect(nextStepId("record")).toBe("credentials");
    expect(nextStepId("credentials")).toBe("endorsements");
    expect(nextStepId("transmission")).toBe("equipment");
    expect(nextStepId("equipment")).toBe("consent");
    expect(previousStepId("cdlClass")).toBe("distance");
    expect(previousStepId("endorsements")).toBe("credentials");
  });

  it("stops at the ends", () => {
    expect(nextStepId("consent")).toBe("done");
    expect(nextStepId("done")).toBe("done");
    expect(previousStepId("name")).toBeNull();
  });

  it("groups a mile's screens as one page, never the done screen", () => {
    expect(stepsOfMile(1).map((step) => step.id)).toEqual(["name", "zip", "distance"]);
    expect(stepsOfMile(2).map((step) => step.id)).toEqual(["cdlClass", "experience", "record"]);
    expect(stepsOfMile(3).map((step) => step.id)).toEqual(["credentials"]);
    expect(stepsOfMile(4).map((step) => step.id)).toEqual(["endorsements", "transmission"]);
    expect(stepsOfMile(5).map((step) => step.id)).toEqual(["equipment"]);
    expect(stepsOfMile(6).map((step) => step.id)).toEqual(["consent"]);
  });
});

describe("options", () => {
  it("covers every enum value with a label, a description and an icon", () => {
    expect(CDL_CLASS_OPTIONS.map((option) => option.value)).toEqual([...CDL_HELD_CLASSES]);
    expect(ENDORSEMENT_OPTIONS.map((option) => option.value).sort()).toEqual(
      [...ENDORSEMENTS].sort(),
    );
    expect(EMPLOYMENT_TYPE_OPTIONS.map((option) => option.value)).toEqual([...EMPLOYMENT_TYPES]);
    expect(DRIVING_STYLE_OPTIONS.map((option) => option.value)).toEqual([...DRIVING_STYLES]);
    expect(TRANSMISSION_OPTIONS.map((option) => option.value)).toEqual([...TRANSMISSION_TYPES]);
    expect(EQUIPMENT_CHIPS.map((option) => option.value)).toEqual([...EQUIPMENT_TYPES]);
    expect(MVR_CHIPS.map((option) => option.value)).toEqual([...MVR_STATUSES]);
    for (const option of [
      ...AVAILABILITY_OPTIONS,
      ...CDL_CLASS_OPTIONS,
      ...ENDORSEMENT_OPTIONS,
      ...EMPLOYMENT_TYPE_OPTIONS,
      ...DRIVING_STYLE_OPTIONS,
      ...TRANSMISSION_OPTIONS,
    ]) {
      expect(option.label.length, option.value).toBeGreaterThan(0);
      expect(option.description.length, option.value).toBeGreaterThan(0);
      expect(typeof option.icon, option.value).toBe("object");
    }
  });

  it("offers the three CDL classes with the approved descriptions, and no No CDL card", () => {
    expect(CDL_CLASS_OPTIONS.map((option) => `${option.label}: ${option.description}`)).toEqual([
      "Class A: Tractor-trailers and big rigs",
      "Class B: Straight trucks, buses, dump trucks",
      "Class C: Passenger vans (16+) and small hazmat vehicles",
    ]);
  });

  it("uses the client's words for employment, driving style, transmission and equipment", () => {
    expect(EMPLOYMENT_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      "W-2 employee",
      "1099 owner-operator",
      "Either works",
    ]);
    expect(DRIVING_STYLE_OPTIONS.map((option) => option.label)).toEqual([
      "Local day cab",
      "Yard spotter",
      "Regional",
      "OTR (over the road)",
    ]);
    expect(TRANSMISSION_OPTIONS.map((option) => option.label)).toEqual([
      "Automatic only",
      "Automatic and manual",
    ]);
    expect(EQUIPMENT_CHIPS.map((option) => option.label)).toEqual([
      "Container drayage",
      "Dry van",
      "Flatbed",
      "Reefer",
      "Yard mule",
    ]);
  });

  it("asks the three checks in the client's words, with two chips each", () => {
    expect(
      Object.entries(CARD_CHECKS).map(([key, check]) => [key, check.question, check.yes, check.no]),
    ).toEqual([
      ["twicActive", "Do you have an active TWIC card?", "Yes", "No"],
      ["medicalCardActive", "Is your DOT medical card current?", "Yes", "No"],
      [
        "clearinghouseRegistered",
        "Are you registered in the FMCSA Clearinghouse?",
        "Registered",
        "Not yet",
      ],
    ]);
  });

  it("asks the MVR in the client's three levels, with major spelled out", () => {
    expect(MVR_QUESTION).toBe("Any moving violations in the last 3 years?");
    expect(MVR_CHIPS.map((chip) => [chip.value, chip.label])).toEqual([
      ["clean", "None"],
      ["minor_1_2", "1 or 2 minor"],
      ["major_3_plus", "3 or more, or a major one"],
    ]);
    expect(MVR_HELPER).toBe(
      "Major means a DUI, reckless driving, leaving the scene or a suspended license.",
    );
    expect(MVR_SUMMARY).toEqual({
      clean: "No violations in 3 years",
      minor_1_2: "1 or 2 minor violations in 3 years",
      major_3_plus: "3 or more or a major violation in 3 years",
    });
  });

  it("gives every endorsement its own icon", () => {
    const icons = new Set(ENDORSEMENT_OPTIONS.map((option) => option.icon));
    expect(icons.size).toBe(ENDORSEMENT_OPTIONS.length);
  });

  it("offers the approved distance and experience chips", () => {
    expect(DISTANCE_CHIPS.map((chip) => chip.label)).toEqual([
      "10 miles",
      "25 miles",
      "50 miles",
      "100 miles",
      "250 miles or more",
    ]);
    expect(EXPERIENCE_CHIPS.map((chip) => [chip.label, chip.value])).toEqual([
      ["Under 1", 0],
      ["1 to 2", 1],
      ["3 to 5", 3],
      ["6 to 10", 6],
      ["10 or more", 10],
    ]);
  });

  it("maps an exact number of years to its range chip", () => {
    expect(experienceChipFor(0)).toBe(0);
    expect(experienceChipFor(2)).toBe(1);
    expect(experienceChipFor(4)).toBe(3);
    expect(experienceChipFor(9)).toBe(6);
    expect(experienceChipFor(10)).toBe(10);
    expect(experienceChipFor(60)).toBe(10);
    expect(experienceChipFor(null)).toBeNull();
    expect(experienceChipFor(undefined)).toBeNull();
    expect(experienceChipFor(Number.NaN)).toBeNull();
    expect(experienceChipFor(99)).toBeNull();
  });

  it("the Documents page asks for the front and back of the CDL, the medical card and other papers", () => {
    expect(ONBOARDING_DOCUMENT_TILES.map((tile) => [tile.type, tile.max])).toEqual([
      ["cdl_front", 1],
      ["cdl_back", 1],
      ["medical_card", 1],
      ["certification", 5],
    ]);
    const other = ONBOARDING_DOCUMENT_TILES[3];
    expect(other.label).toBe("Other papers");
    expect(other.helper).toBe("TWIC card, forklift card, other certificates");
  });
});

describe("endorsement rules", () => {
  it("picking X also picks H and N", () => {
    expect(toggleEndorsement([], "X")).toEqual(["X", "H", "N"]);
    expect(toggleEndorsement(["T"], "X")).toEqual(["X", "H", "N", "T"]);
  });

  it("dropping H or N also drops X", () => {
    expect(toggleEndorsement(["X", "H", "N"], "H")).toEqual(["N"]);
    expect(toggleEndorsement(["X", "H", "N", "T"], "N")).toEqual(["H", "T"]);
  });

  it("dropping X keeps H and N", () => {
    expect(toggleEndorsement(["X", "H", "N"], "X")).toEqual(["H", "N"]);
  });

  it("toggles other letters on and off in display order", () => {
    expect(toggleEndorsement(["P"], "T")).toEqual(["T", "P"]);
    expect(toggleEndorsement(["T", "P"], "P")).toEqual(["T"]);
  });

  it("picking S (school bus) also picks P (passengers), the federal rule", () => {
    expect(toggleEndorsement([], "S")).toEqual(["P", "S"]);
    expect(toggleEndorsement(["T"], "S")).toEqual(["T", "P", "S"]);
  });

  it("dropping P also drops S, while dropping S keeps P", () => {
    expect(toggleEndorsement(["P", "S"], "P")).toEqual([]);
    expect(toggleEndorsement(["T", "P", "S"], "P")).toEqual(["T"]);
    expect(toggleEndorsement(["P", "S"], "S")).toEqual(["P"]);
  });

  it("normalizes saved data the same way: X brings H and N, S brings P", () => {
    expect(normalizeEndorsements(["X"])).toEqual(["X", "H", "N"]);
    expect(normalizeEndorsements(["S", "H"])).toEqual(["H", "P", "S"]);
    expect(normalizeEndorsements(["S"])).toEqual(["P", "S"]);
    expect(normalizeEndorsements(["P"])).toEqual(["P"]);
    expect(normalizeEndorsements([])).toEqual([]);
  });
});
