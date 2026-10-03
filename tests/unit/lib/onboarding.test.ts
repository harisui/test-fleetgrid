// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CDL_CLASS_OPTIONS,
  ENDORSEMENT_OPTIONS,
  EXPERIENCE_CHIPS,
  experienceChipFor,
  normalizeEndorsements,
  ONBOARDING_DOCUMENT_TILES,
  toggleEndorsement,
  WORK_TYPE_OPTIONS,
  AVAILABILITY_OPTIONS,
  DISTANCE_CHIPS,
} from "@/lib/onboarding/options";
import {
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
import { CDL_CLASSES, ENDORSEMENTS } from "@/types/domain";

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

  it("has thirteen screens in the approved order and mile map", () => {
    expect(STEPS.map((step) => `${step.mile}:${step.id}`)).toEqual([
      "1:name",
      "1:zip",
      "1:distance",
      "2:workType",
      "2:experience",
      "2:availability",
      "3:cdlClass",
      "3:endorsements",
      "3:certifications",
      "4:documents",
      "5:bio",
      "5:consent",
      "5:done",
    ]);
    expect(DONE_STEP_NUMBER).toBe(13);
    expect(SAVABLE_STEP_IDS).toHaveLength(12);
    expect(SAVABLE_STEP_IDS).not.toContain("done");
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
    expect(stepNumber("done")).toBe(13);
    expect(stepByNumber(7).id).toBe("cdlClass");
    expect(() => stepByNumber(0)).toThrow(/Unknown onboarding step/);
    expect(() => stepByNumber(14)).toThrow(/Unknown onboarding step/);
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
  });
});

describe("progressFor", () => {
  it("derives the eyebrow, screen-reader label and truck position from the config", () => {
    expect(progressFor("workType")).toMatchObject({
      number: 4,
      mile: { mile: 2, label: "Work" },
      percent: 25,
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
  const withCdl = { cdlClass: "A" };
  const noCdl = { cdlClass: "none" };
  const unknown = { cdlClass: null };

  it("endorsements only apply to drivers with a CDL", () => {
    expect(stepApplies("endorsements", withCdl)).toBe(true);
    expect(stepApplies("endorsements", noCdl)).toBe(false);
    expect(stepApplies("endorsements", unknown)).toBe(false);
    expect(stepApplies("cdlClass", noCdl)).toBe(true);
  });

  it("skips endorsements after No CDL, forwards and backwards", () => {
    expect(nextStepId("cdlClass", withCdl)).toBe("endorsements");
    expect(nextStepId("cdlClass", noCdl)).toBe("certifications");
    expect(previousStepId("certifications", withCdl)).toBe("endorsements");
    expect(previousStepId("certifications", noCdl)).toBe("cdlClass");
  });

  it("stops at the ends", () => {
    expect(nextStepId("consent", withCdl)).toBe("done");
    expect(nextStepId("done", withCdl)).toBe("done");
    expect(previousStepId("name", withCdl)).toBeNull();
  });

  it("groups a mile's applicable screens for desktop", () => {
    expect(stepsOfMile(3, withCdl).map((step) => step.id)).toEqual([
      "cdlClass",
      "endorsements",
      "certifications",
    ]);
    expect(stepsOfMile(3, noCdl).map((step) => step.id)).toEqual(["cdlClass", "certifications"]);
    expect(stepsOfMile(5, withCdl).map((step) => step.id)).toEqual(["bio", "consent"]);
  });
});

describe("options", () => {
  it("covers every enum value with a label, a description and an icon", () => {
    expect(CDL_CLASS_OPTIONS.map((option) => option.value)).toEqual([...CDL_CLASSES]);
    expect(ENDORSEMENT_OPTIONS.map((option) => option.value).sort()).toEqual(
      [...ENDORSEMENTS].sort(),
    );
    for (const option of [
      ...WORK_TYPE_OPTIONS,
      ...AVAILABILITY_OPTIONS,
      ...CDL_CLASS_OPTIONS,
      ...ENDORSEMENT_OPTIONS,
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

  it("asks for the front and back of the CDL and the medical card", () => {
    expect(ONBOARDING_DOCUMENT_TILES.map((tile) => tile.type)).toEqual([
      "cdl_front",
      "cdl_back",
      "medical_card",
    ]);
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

  it("normalizes saved data the same way", () => {
    expect(normalizeEndorsements(["X"])).toEqual(["X", "H", "N"]);
    expect(normalizeEndorsements(["S", "H"])).toEqual(["H", "S"]);
    expect(normalizeEndorsements([])).toEqual([]);
  });
});
