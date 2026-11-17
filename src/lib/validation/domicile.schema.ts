import { z } from "zod";
import { US_STATE_CODES } from "@/lib/constants";
import { asksTexas30Days } from "@/lib/drivers/domicile";

/** The attorney's domicile questions (0044). Carrier-facing wording is not involved. */
export const DOMICILE_STATE_MESSAGE = "Choose your state of domicile";
export const CDL_ADDRESS_MESSAGE = "Tap Yes or No for the address on your CDL";
export const TEXAS_30_DAYS_MESSAGE = "Tap Yes or No for when you made Texas your home";
export const TRANSFER_MESSAGE = "Tap Yes or No for the CDL transfer";
export const DOMICILE_CONFIRM_MESSAGE = "Tick the box to confirm your answers";

/**
 * The answers. `cdlState` is the state on the driver's card, sent by the page so it can show the
 * Texas questions; the server replaces it with the stored one. A question not asked is dropped.
 */
export const domicileFormSchema = z
  .object({
    cdlState: z.string().nullish().transform((value) => value ?? null),
    domicileState: z.enum(US_STATE_CODES as [string, ...string[]], { error: DOMICILE_STATE_MESSAGE }),
    cdlAddressCurrent: z.boolean({ error: CDL_ADDRESS_MESSAGE }),
    txDomicileWithin30Days: z.boolean().nullish().transform((value) => value ?? null),
    cdlTransferApplied: z.boolean().nullish().transform((value) => value ?? null),
    confirmed: z.literal(true, { error: DOMICILE_CONFIRM_MESSAGE }),
  })
  .superRefine((data, context) => {
    if (!asksTexas30Days(data)) return;
    if (data.txDomicileWithin30Days === null) {
      context.addIssue({ code: "custom", path: ["txDomicileWithin30Days"], message: TEXAS_30_DAYS_MESSAGE });
    } else if (data.txDomicileWithin30Days === false && data.cdlTransferApplied === null) {
      context.addIssue({ code: "custom", path: ["cdlTransferApplied"], message: TRANSFER_MESSAGE });
    }
  });

/** On the server: the same rules, then only the questions that were asked are kept. */
export const domicileSchema = domicileFormSchema.transform((data) => {
    const texas = asksTexas30Days(data);
    return {
      domicileState: data.domicileState,
      cdlAddressCurrent: data.cdlAddressCurrent,
      txDomicileWithin30Days: texas ? data.txDomicileWithin30Days : null,
      cdlTransferApplied: texas && data.txDomicileWithin30Days === false ? data.cdlTransferApplied : null,
    };
});

export type DomicileInput = z.input<typeof domicileSchema>;
