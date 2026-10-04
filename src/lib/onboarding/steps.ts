/**
 * The single source of truth for the driver onboarding flow: the five miles, the thirteen
 * screens in order, and the progress shown for each. Every screen, the sign header, the lane
 * progress bar and the server read from here. Nothing about the flow is defined anywhere else.
 */

export const MILES = [
  { mile: 1, label: "About" },
  { mile: 2, label: "Work" },
  { mile: 3, label: "License" },
  { mile: 4, label: "Papers" },
  { mile: 5, label: "Finish" },
] as const;

export type Mile = (typeof MILES)[number];
export type MileNumber = Mile["mile"];

/** One line per stage for the Help sheet: what the questions in it are about. */
export const MILE_SUMMARIES: Record<MileNumber, string> = {
  1: "Your name, your ZIP code and how far you will travel.",
  2: "The work you do, your years of experience and when you can work.",
  3: "Your CDL class, the letters on it and any certifications.",
  4: "Photos of your CDL, medical card and other papers. You can skip this.",
  5: "A few words about you, and your OK to receive shift offers by text.",
};

export const STEPS = [
  { id: "name", mile: 1, question: "What is your name?" },
  { id: "zip", mile: 1, question: "What is your ZIP code?" },
  { id: "distance", mile: 1, question: "How far will you travel for work?" },
  { id: "workType", mile: 2, question: "What work do you do?" },
  { id: "experience", mile: 2, question: "How many years have you done this work?" },
  { id: "availability", mile: 2, question: "When can you work?" },
  { id: "cdlClass", mile: 3, question: "What class is your CDL?" },
  {
    id: "endorsements",
    mile: 3,
    question: "Any extra letters on your CDL?",
    helper: "These are called endorsements. They're printed next to END on the front.",
  },
  { id: "certifications", mile: 3, question: "Do you have any certifications?", optional: true },
  { id: "documents", mile: 4, question: "Do you want to add your papers now?", optional: true },
  { id: "bio", mile: 5, question: "Anything carriers should know?", optional: true },
  { id: "consent", mile: 5, question: "Can we text you about shifts?" },
  { id: "done", mile: 5, question: "You are listed." },
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
  /** Shown in the sign header, for example "Mile 2 of 5 · Work". */
  eyebrow: string;
  /** Read by screen readers instead of the mile metaphor, for example "Step 2 of 5: Work". */
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
    eyebrow: `Mile ${mile.mile} of ${MILES.length} · ${mile.label}`,
    srLabel: `Step ${mile.mile} of ${MILES.length}: ${mile.label}`,
    completedMiles: MILES.filter((candidate) => candidate.mile < mile.mile).map(
      (candidate) => candidate.mile,
    ),
  };
}

/** What the screens need to know about the saved card to decide what applies. */
export interface FlowContext {
  cdlClass: string | null;
}

/** The endorsements screen only applies to drivers with a CDL. Everything else always applies. */
export function stepApplies(id: StepId, context: FlowContext): boolean {
  if (id === "endorsements") return context.cdlClass !== null && context.cdlClass !== "none";
  return true;
}

/** The next screen after `id` that applies, or the done screen. */
export function nextStepId(id: StepId, context: FlowContext): StepId {
  let number = stepNumber(id) + 1;
  while (number < DONE_STEP_NUMBER && !stepApplies(stepByNumber(number).id, context)) number += 1;
  return stepByNumber(Math.min(number, DONE_STEP_NUMBER)).id;
}

/** The previous screen before `id` that applies, or null on the first screen. */
export function previousStepId(id: StepId, context: FlowContext): StepId | null {
  let number = stepNumber(id) - 1;
  while (number >= FIRST_STEP_NUMBER && !stepApplies(stepByNumber(number).id, context)) {
    number -= 1;
  }
  return number >= FIRST_STEP_NUMBER ? stepByNumber(number).id : null;
}

/**
 * The screens of one mile, in order. With a context, only the ones that apply; without one,
 * every screen of the mile, for a page that decides live which of them to show.
 */
export function stepsOfMile(mile: MileNumber, context?: FlowContext): Step[] {
  return STEPS.filter(
    (step) =>
      step.mile === mile && step.id !== "done" && (!context || stepApplies(step.id, context)),
  );
}
