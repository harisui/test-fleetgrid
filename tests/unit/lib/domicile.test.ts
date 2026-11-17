import { describe, expect, it } from "vitest";
import { asksTexas30Days, DOMICILE_QUESTIONS, DOMICILE_STATEMENT, needsCdlTransferReview } from "@/lib/drivers/domicile";
import { shiftReadyMissing } from "@/lib/drivers/tiers";
import {
  CDL_ADDRESS_MESSAGE,
  DOMICILE_CONFIRM_MESSAGE,
  DOMICILE_STATE_MESSAGE,
  domicileSchema,
  TEXAS_30_DAYS_MESSAGE,
  TRANSFER_MESSAGE,
} from "@/lib/validation/domicile.schema";
import { buildDriver } from "../../setup/factories";

const PAPERS = ["cdl_front", "cdl_back", "medical_card"] as const;
const issues = (input: object) =>
  Object.fromEntries((domicileSchema.safeParse(input).error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]));

/** Out-of-state CDLs and the state of domicile (Milestone 6 feature 4; the attorney, 2026-11-14). */
describe("domicile", () => {
  it("asks the attorney's questions, in his words", () => {
    expect(DOMICILE_QUESTIONS.domicileState).toBe("What is your current state of domicile?");
    expect(DOMICILE_QUESTIONS.cdlAddressCurrent).toBe("Is the residential address on your CDL your current residential address?");
    expect(DOMICILE_STATEMENT).toMatch(/^I confirm this information is accurate, and I am responsible for maintaining a CDL/);
  });

  it("asks about the last 30 days only with a Texas home and a CDL from another state", () => {
    expect(asksTexas30Days({ cdlState: "LA", domicileState: "TX" })).toBe(true);
    expect(asksTexas30Days({ cdlState: "TX", domicileState: "TX" })).toBe(false);
    expect(asksTexas30Days({ cdlState: "LA", domicileState: "LA" })).toBe(false);
    expect(asksTexas30Days({ cdlState: null, domicileState: "TX" })).toBe(false);
  });

  it("flags for review only a Texas home older than 30 days, a CDL from another state and no transfer applied for", () => {
    const flagged = { cdlState: "LA", domicileState: "TX", txDomicileWithin30Days: false, cdlTransferApplied: false };
    expect(needsCdlTransferReview(flagged)).toBe(true);
    expect(needsCdlTransferReview({ ...flagged, cdlTransferApplied: true })).toBe(false);
    expect(needsCdlTransferReview({ ...flagged, txDomicileWithin30Days: true, cdlTransferApplied: null })).toBe(false);
    expect(needsCdlTransferReview({ ...flagged, domicileState: "LA" })).toBe(false);
    expect(needsCdlTransferReview({ ...flagged, cdlState: "TX" })).toBe(false);
  });

  it("a CDL from another state is fine on its own; the flag waits for an admin's reason", () => {
    expect(shiftReadyMissing(buildDriver({ cdlState: "LA", domicileState: "LA" }), PAPERS)).toEqual([]);
    const flagged = buildDriver({ cdlState: "LA", domicileState: "TX", txDomicileWithin30Days: false, cdlTransferApplied: false });
    expect(shiftReadyMissing(flagged, PAPERS)).toEqual(["cdl_transfer_review"]);
    expect(shiftReadyMissing({ ...flagged, shiftReadyOverrideReason: "Transfer booked at DPS" }, PAPERS)).toEqual([]);
    expect(shiftReadyMissing(buildDriver({ cdlState: null }), PAPERS)).toEqual(["cdl_state"]);
  });

  it("needs every asked answer and the box; the questions not asked are dropped", () => {
    expect(issues({ cdlState: "LA" })).toEqual({
      domicileState: DOMICILE_STATE_MESSAGE,
      cdlAddressCurrent: CDL_ADDRESS_MESSAGE,
      confirmed: DOMICILE_CONFIRM_MESSAGE,
    });
    expect(issues({ cdlState: "LA", domicileState: "TX", cdlAddressCurrent: true, confirmed: true })).toEqual({
      txDomicileWithin30Days: TEXAS_30_DAYS_MESSAGE,
    });
    expect(
      issues({ cdlState: "LA", domicileState: "TX", cdlAddressCurrent: true, txDomicileWithin30Days: false, confirmed: true }),
    ).toEqual({ cdlTransferApplied: TRANSFER_MESSAGE });
    expect(
      domicileSchema.parse({
        cdlState: "TX",
        domicileState: "TX",
        cdlAddressCurrent: false,
        txDomicileWithin30Days: true,
        cdlTransferApplied: true,
        confirmed: true,
      }),
    ).toEqual({ domicileState: "TX", cdlAddressCurrent: false, txDomicileWithin30Days: null, cdlTransferApplied: null });
    expect(
      domicileSchema.parse({
        cdlState: "LA",
        domicileState: "TX",
        cdlAddressCurrent: true,
        txDomicileWithin30Days: true,
        cdlTransferApplied: false,
        confirmed: true,
      }),
    ).toEqual({ domicileState: "TX", cdlAddressCurrent: true, txDomicileWithin30Days: true, cdlTransferApplied: null });
  });
});
