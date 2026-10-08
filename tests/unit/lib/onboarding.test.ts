// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CARD_CHECKS,
  CDL_CLASS_OPTIONS,
  CERTIFICATION_SUGGESTIONS,
  DRIVING_STYLE_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  ENDORSEMENT_OPTIONS,
  EQUIPMENT_CHIPS,
  EXPERIENCE_CHIPS,
  experienceChipFor,
  normalizeEndorsements,
  ONBOARDING_DOCUMENT_TILES,
  toggleEndorsement,
  TRANSMISSION_OPTIONS,
  WORK_TYPE_OPTIONS,
  AVAILABILITY_OPTIONS,
  DISTANCE_CHIPS,
} from "@/lib/onboarding/options";
import {
  CDL_ONLY_STEP_IDS,
  contextOf,
  DONE_STEP_NUMBER,
  isSavableStepId,
  isStepId,
  MILES,
  nextStepId,
  previousStepId,
  progressFor,
  SAVABLE_STEP_IDS,
  stepApplies,
  stepById,
  stepByNumber,
  stepNumber,
  STEPS,
  stepsOfMile,
} from "@/lib/onboarding/steps";
import {
  CDL_CLASSES,
  DRIVING_STYLES,
  EMPLOYMENT_TYPES,
  ENDORSEMENTS,
  EQUIPMENT_TYPES,
  TRANSMISSION_TYPES,
} from "@/types/domain";

describe("steps config", () => {
  it("has five miles labelled About, Work, License, Papers, Finish", () => {
    expect(MILES.map((mile) => `${mile.mile} ${mile.label}`)).toEqual([
      "1 About",
      "2 Work",
      "3 License",
      "4 Papers",
      "5 Finish",
    ]);
  });

  it("has eighteen screens in the approved order and mile map", () => {
    expect(STEPS.map((step) => `${step.mile}:${step.id}`)).toEqual([
      "1:name",
      "1:zip",
      "1:distance",
      "2:workType",
      "2:employmentType",
      "2:drivingStyle",
      "2:equipment",
      "2:experience",
      "2:availability",
      "3:cdlClass",
      "3:endorsements",
      "3:certifications",
      "3:credentials",
      "4:documents",
      "4:compliance",
      "5:bio",
      "5:consent",
      "5:done",
    ]);
    expect(DONE_STEP_NUMBER).toBe(18);
    expect(SAVABLE_STEP_IDS).toHaveLength(17);
    expect(SAVABLE_STEP_IDS).not.toContain("done");
  });

  it("asks driving style, equipment and the record of CDL drivers only", () => {
    expect(CDL_ONLY_STEP_IDS).toEqual(["drivingStyle", "equipment", "compliance"]);
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
    expect(stepById("employmentType").question).toBe("Do you work W-2 or 1099?");
    expect(stepById("drivingStyle").question).toBe("What kind of driving do you do?");
    expect(stepById("equipment").question).toBe("What equipment do you run?");
    expect(stepById("credentials").question).toBe("Do you have these cards?");
    expect(stepById("compliance").question).toBe("How is your driving record?");
  });

  it("marks only certifications, papers and about-you as optional", () => {
    expect(STEPS.filter((step) => "optional" in step && step.optional).map((s) => s.id)).toEqual([
      "certifications",
      "documents",
      "bio",
    ]);
  });

  it("numbers steps from 1 and looks them up both ways", () => {
    expect(stepNumber("name")).toBe(1);
    expect(stepNumber("done")).toBe(18);
    expect(stepByNumber(10).id).toBe("cdlClass");
    expect(() => stepByNumber(0)).toThrow(/Unknown onboarding step/);
    expect(() => stepByNumber(19)).toThrow(/Unknown onboarding step/);
    expect(() => stepByNumber(1.5)).toThrow(/Unknown onboarding step/);
    expect(() => stepById("nope" as never)).toThrow(/Unknown onboarding step/);
  });

  it("recognises step ids", () => {
    expect(isStepId("zip")).toBe(true);
    expect(isStepId("done")).toBe(true);
    expect(isStepId("basics")).toBe(false);
    expect(isStepId(1)).toBe(false);
    expect(isSavableStepId("done")).toBe(false);
    expect(isSavableStepId("consent")).toBe(true);
    expect(isSavableStepId("compliance")).toBe(true);
  });
});

describe("progressFor", () => {
  it("derives the eyebrow, screen-reader label and truck position from the config", () => {
    expect(progressFor("workType")).toMatchObject({
      number: 4,
      mile: { mile: 2, label: "Work" },
      percent: 18,
      eyebrow: "Mile 2 of 5 · Work",
      srLabel: "Step 2 of 5: Work",
      completedMiles: [1],
    });
    expect(progressFor("name")).toMatchObject({ percent: 0, completedMiles: [] });
    expect(progressFor("done")).toMatchObject({ percent: 100, completedMiles: [1, 2, 3, 4] });
  });

  it("moves the truck forward on every screen", () => {
    const percents = STEPS.map((step) => progressFor(step.id).percent);
    for (let index = 1; index < percents.length; index += 1) {
      expect(percents[index]).toBeGreaterThan(percents[index - 1]);
    }
  });
});

describe("flow navigation", () => {
  const withCdl = { cdlClass: "A", operatorTypes: ["cdl_driver"] };
  const noCdl = { cdlClass: "none", operatorTypes: ["yard_spotter"] };
  const mechanic = { cdlClass: "A", operatorTypes: ["mechanic"] };
  const unknown = { cdlClass: null, operatorTypes: [] };

  it("reads the context off a saved card, or none", () => {
    expect(contextOf(null)).toEqual(unknown);
    expect(contextOf(undefined)).toEqual(unknown);
    expect(contextOf({ cdlClass: "B", operatorTypes: ["cdl_driver", "mechanic"] })).toEqual({
      cdlClass: "B",
      operatorTypes: ["cdl_driver", "mechanic"],
    });
  });

  it("endorsements only apply to drivers with a CDL", () => {
    expect(stepApplies("endorsements", withCdl)).toBe(true);
    expect(stepApplies("endorsements", noCdl)).toBe(false);
    expect(stepApplies("endorsements", unknown)).toBe(false);
    expect(stepApplies("cdlClass", noCdl)).toBe(true);
  });

  it("the CDL-only screens apply when the work includes CDL driving, whatever the class", () => {
    for (const id of CDL_ONLY_STEP_IDS) {
      expect(stepApplies(id, withCdl), id).toBe(true);
      expect(stepApplies(id, { cdlClass: null, operatorTypes: ["cdl_driver"] }), id).toBe(true);
      expect(stepApplies(id, mechanic), id).toBe(false);
      expect(stepApplies(id, noCdl), id).toBe(false);
      expect(stepApplies(id, unknown), id).toBe(false);
    }
    expect(stepApplies("employmentType", mechanic)).toBe(true);
    expect(stepApplies("credentials", mechanic)).toBe(true);
  });

  it("skips endorsements after No CDL, forwards and backwards", () => {
    expect(nextStepId("cdlClass", withCdl)).toBe("endorsements");
    expect(nextStepId("cdlClass", noCdl)).toBe("certifications");
    expect(previousStepId("certifications", withCdl)).toBe("endorsements");
    expect(previousStepId("certifications", noCdl)).toBe("cdlClass");
  });

  it("skips the CDL-only screens for work without CDL driving, forwards and backwards", () => {
    expect(nextStepId("workType", withCdl)).toBe("employmentType");
    expect(nextStepId("employmentType", withCdl)).toBe("drivingStyle");
    expect(nextStepId("drivingStyle", withCdl)).toBe("equipment");
    expect(nextStepId("equipment", withCdl)).toBe("experience");
    expect(nextStepId("employmentType", mechanic)).toBe("experience");
    expect(previousStepId("experience", withCdl)).toBe("equipment");
    expect(previousStepId("experience", mechanic)).toBe("employmentType");

    expect(nextStepId("certifications", withCdl)).toBe("credentials");
    expect(nextStepId("credentials", mechanic)).toBe("documents");
    expect(nextStepId("documents", withCdl)).toBe("compliance");
    expect(nextStepId("documents", mechanic)).toBe("bio");
    expect(previousStepId("bio", withCdl)).toBe("compliance");
    expect(previousStepId("bio", mechanic)).toBe("documents");
  });

  it("stops at the ends", () => {
    expect(nextStepId("consent", withCdl)).toBe("done");
    expect(nextStepId("done", withCdl)).toBe("done");
    expect(previousStepId("name", withCdl)).toBeNull();
  });

  it("groups a mile's applicable screens for desktop", () => {
    expect(stepsOfMile(2, withCdl).map((step) => step.id)).toEqual([
      "workType",
      "employmentType",
      "drivingStyle",
      "equipment",
      "experience",
      "availability",
    ]);
    expect(stepsOfMile(2, mechanic).map((step) => step.id)).toEqual([
      "workType",
      "employmentType",
      "experience",
      "availability",
    ]);
    expect(stepsOfMile(3, withCdl).map((step) => step.id)).toEqual([
      "cdlClass",
      "endorsements",
      "certifications",
      "credentials",
    ]);
    expect(stepsOfMile(3, noCdl).map((step) => step.id)).toEqual([
      "cdlClass",
      "certifications",
      "credentials",
    ]);
    expect(stepsOfMile(4, withCdl).map((step) => step.id)).toEqual(["documents", "compliance"]);
    expect(stepsOfMile(4, mechanic).map((step) => step.id)).toEqual(["documents"]);
    expect(stepsOfMile(5, withCdl).map((step) => step.id)).toEqual(["bio", "consent"]);
  });

  it("lists every screen of a mile when no context is given, never the done screen", () => {
    expect(stepsOfMile(3).map((step) => step.id)).toEqual([
      "cdlClass",
      "endorsements",
      "certifications",
      "credentials",
    ]);
    expect(stepsOfMile(4).map((step) => step.id)).toEqual(["documents", "compliance"]);
    expect(stepsOfMile(5).map((step) => step.id)).toEqual(["bio", "consent"]);
  });
});

describe("options", () => {
  it("covers every enum value with a label, a description and an icon", () => {
    expect(CDL_CLASS_OPTIONS.map((option) => option.value)).toEqual([...CDL_CLASSES]);
    expect(ENDORSEMENT_OPTIONS.map((option) => option.value).sort()).toEqual(
      [...ENDORSEMENTS].sort(),
    );
    expect(EMPLOYMENT_TYPE_OPTIONS.map((option) => option.value)).toEqual([...EMPLOYMENT_TYPES]);
    expect(DRIVING_STYLE_OPTIONS.map((option) => option.value)).toEqual([...DRIVING_STYLES]);
    expect(TRANSMISSION_OPTIONS.map((option) => option.value)).toEqual([...TRANSMISSION_TYPES]);
    expect(EQUIPMENT_CHIPS.map((option) => option.value)).toEqual([...EQUIPMENT_TYPES]);
    for (const option of [
      ...WORK_TYPE_OPTIONS,
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

  it("uses the approved CDL class descriptions", () => {
    expect(CDL_CLASS_OPTIONS.map((option) => `${option.label}: ${option.description}`)).toEqual([
      "Class A: Tractor-trailers and big rigs",
      "Class B: Straight trucks, buses, dump trucks",
      "Class C: Passenger vans (16+) and small hazmat vehicles",
      "No CDL: Fine for yard and shop work",
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

  it("asks the four checks in the client's words, with two chips each", () => {
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
      ["mvrClean3Years", "Any moving violations in the last 3 years?", "None", "One or more"],
    ]);
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

  it("suggests certifications without TWIC, which has its own question", () => {
    expect(CERTIFICATION_SUGGESTIONS).toEqual(["Forklift", "OSHA 10", "ASE"]);
  });

  it("asks for the front and back of the CDL, the medical card and other papers", () => {
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
