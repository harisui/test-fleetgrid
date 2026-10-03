import { z } from "zod";
import { otpCodeSchema } from "@/lib/validation/phone.schema";

/** Deleting an account needs a fresh code texted to the signed-in number. */
export const deleteAccountSchema = z.object({ code: otpCodeSchema });

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
