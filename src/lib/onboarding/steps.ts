/**
 * The single source of truth for the driver onboarding flow: the six miles, the twelve
 * screens in order, and the progress shown for each. Every screen, the sign header, the lane
 * progress bar and the server read from here. Nothing about the flow is defined anywhere else.
 *
 * A mile is one page on every device (client decision of 2026-10-09: the shortest sign-up
 * that still lets a carrier book on the answers; CDL drivers only at launch). The answers
 * the flow no longer asks (W-2 or 1099, driving style, availability, certifications, papers,
 * Clearinghouse, about you) stay on the profile page, filled in later or never.
 */

export const MILES = [
  { mile: 1, label: "About" },
  { mile: 2, label: "CDL" },
  { mile: 3, label: "Cards" },
  { mile: 4, label: "Letters" },
  { mile: 5, label: "Equipment" },
  { mile: 6, label: "Finish" },
] as const;

export type Mile = (typeof MILES)[number];
export type MileNumber = Mile["mile"];

/** One line per stage for the Help sheet: what the questions in it are about. */
export const MILE_SUMMARIES: Record<MileNumber, string> = {
  1: "Your name, your ZIP code and how far you will travel.",
  2: "Your CDL class, your years of driving and your record.",
  3: "Your TWIC card and your DOT medical card.",
  4: "The extra letters on your CDL, and whether you can drive a manual.",
  5: "The equipment you run.",
  6: "Your OK to receive shift offers by text, then you are listed.",
};

export const STEPS = [
  { id: "name", mile: 1, question: "What is your name?" },
  { id: "zip", mile: 1, question: "What is your ZIP code?" },
  { id: "distance", mile: 1, question: "How far will you travel for work?" },
  { id: "cdlClass", mile: 2, question: "What class is your CDL?" },
  { id: "experience", mile: 2, question: "How many years have you driven with a CDL?" },
  { id: "record", mile: 2, question: "Any moving violations in the last 3 years?" },
  { id: "credentials", mile: 3, question: "Do you have these cards?" },
  {
    id: "endorsements",
    mile: 4,
    question: "Any extra letters on your CDL?",
    helper: "These are called endorsements. They're printed next to END on the front.",
  },
  { id: "transmission", mile: 4, question: "Can you drive a manual?" },
  { id: "equipment", mile: 5, question: "What equipment do you run?" },
  { id: "consent", mile: 6, question: "Can we text you about shifts?" },
  { id: "done", mile: 6, question: "You are listed." },
] as const;

export type Step = (typeof STEPS)[number];
export type StepId = Step["id"];

/** Screens that accept a save. The done screen only shows the result. */
export const SAVABLE_STEP_IDS = STEPS.filter((step) => step.id !== "done").map(
  (step) => step.id,
) as Exclude<StepId, "done">[];
export type SavableStepId = (typeof SAVABLE_STEP_IDS)[number];

/** 1-based step numbers. `drivers.onboarding_step` stores the number of the next screen to show. */
export const FIRST_STEP_NUMBER = 1;
export const DONE_STEP_NUMBER = STEPS.length;

export function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && STEPS.some((step) => step.id === value);
}

export function isSavableStepId(value: unknown): value is SavableStepId {
  return isStepId(value) && value !== "done";
}

export function stepById(id: StepId): Step {
  const step = STEPS.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`Unknown onboarding step: ${id}`);
  return step;
}

export function stepNumber(id: StepId): number {
  return STEPS.findIndex((step) => step.id === id) + 1;
}

export function stepByNumber(number: number): Step {
  const step = STEPS[number - 1];
  if (!step || !Number.isInteger(number)) throw new Error(`Unknown onboarding step: ${number}`);
  return step;
}

export function mileOf(mile: MileNumber): Mile {
  return MILES[mile - 1];
}

export interface StepProgress {
  step: Step;
  /** 1-based position in the flow. */
  number: number;
  mile: Mile;
  /** 0 on the first screen, 100 on the done screen. Drives the lane fill and the truck. */
  percent: number;
  /** Shown in the sign header, for example "Mile 2 of 6". */
  eyebrow: string;
  /** Read by screen readers instead of the mile metaphor, for example "Step 2 of 6: CDL". */
  srLabel: string;
  /** Mile numbers already completed. */
  completedMiles: MileNumber[];
}

export function progressFor(id: StepId): StepProgress {
  const step = stepById(id);
  const number = stepNumber(id);
  const mile = mileOf(step.mile);
  return {
    step,
    number,
    mile,
    percent: Math.round(((number - 1) / (STEPS.length - 1)) * 100),
    eyebrow: `Mile ${mile.mile} of ${MILES.length}`,
    srLabel: `Step ${mile.mile} of ${MILES.length}: ${mile.label}`,
    completedMiles: MILES.filter((candidate) => candidate.mile < mile.mile).map(
      (candidate) => candidate.mile,
    ),
  };
}

/** The next screen after `id`, or the done screen. */
export function nextStepId(id: StepId): StepId {
  return stepByNumber(Math.min(stepNumber(id) + 1, DONE_STEP_NUMBER)).id;
}

/** The screen before `id`, or null on the first screen. */
export function previousStepId(id: StepId): StepId | null {
  const number = stepNumber(id) - 1;
  return number >= FIRST_STEP_NUMBER ? stepByNumber(number).id : null;
}

/** The screens of one mile, in order: one page. Never the done screen. */
export function stepsOfMile(mile: MileNumber): Step[] {
  return STEPS.filter((step) => step.mile === mile && step.id !== "done");
}
