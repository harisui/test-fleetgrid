import type { Driver } from "@/types/domain";

/**
 * Out-of-state CDLs and the state of domicile (Milestone 6 feature 4; the attorney, Upwork,
 * 2026-11-14). A valid CDL from any state is accepted. These are his questions, in his order.
 */
export const DOMICILE_QUESTIONS = {
  domicileState: "What is your current state of domicile?",
  cdlAddressCurrent: "Is the residential address on your CDL your current residential address?",
  txDomicileWithin30Days: "Texas is your state of domicile and your CDL was issued by another state. Did you establish Texas domicile within the last 30 days?",
  cdlTransferApplied: "Have you transferred, or applied to transfer, your CDL to Texas?",
} as const;

/** The confirmation the driver ticks, recorded with the answers. */
export const DOMICILE_STATEMENT =
  "I confirm this information is accurate, and I am responsible for maintaining a CDL that complies with applicable licensing requirements.";

/** Where the questions live: every driver answers them once (0044). */
export const DOMICILE_PATH = "/driver/domicile";

type DomicileAnswers = Pick<Driver, "cdlState" | "domicileState" | "txDomicileWithin30Days" | "cdlTransferApplied">;

/** Asked only with a Texas domicile and a CDL from another state. */
export const asksTexas30Days = (answers: Pick<Driver, "cdlState" | "domicileState">): boolean =>
  answers.domicileState === "TX" && answers.cdlState !== null && answers.cdlState !== "TX";

/** The same rule as needs_cdl_transfer_review() in 0044: reviewed by an admin before offers. */
export function needsCdlTransferReview(answers: DomicileAnswers): boolean {
  return asksTexas30Days(answers) && answers.txDomicileWithin30Days === false && answers.cdlTransferApplied === false;
}

/** The driver has not answered yet: the driver pages ask, offers are not stopped for it. */
export const needsDomicileAnswers = (driver: Pick<Driver, "domicileConfirmedAt">): boolean => driver.domicileConfirmedAt === null;
