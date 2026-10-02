import { z } from "zod";
import { OTP_LENGTH } from "@/lib/constants";
import { normalizeUsPhone } from "@/lib/phone";

/** Accepts common US formats and outputs E.164 (+1XXXXXXXXXX). */
export const phoneSchema = z
  .string({ error: "Enter your mobile number" })
  .trim()
  .min(1, "Enter your mobile number")
  .transform((value, context) => {
    const normalized = normalizeUsPhone(value);
    if (!normalized) {
      context.addIssue({ code: "custom", message: "Enter a valid US mobile number" });
      return z.NEVER;
    }
    return normalized;
  });

export const otpCodeSchema = z
  .string({ error: "Enter the code we texted you" })
  .trim()
  .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), `Enter the ${OTP_LENGTH}-digit code`);

export const requestOtpSchema = z.object({ phone: phoneSchema });

export const verifyOtpSchema = z.object({ phone: phoneSchema, code: otpCodeSchema });

export const chooseRoleSchema = z.object({
  role: z.enum(["driver", "carrier"], { error: "Choose Driver or Carrier" }),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ChooseRoleInput = z.infer<typeof chooseRoleSchema>;
