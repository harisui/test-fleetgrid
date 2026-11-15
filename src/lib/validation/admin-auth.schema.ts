import { z } from "zod";

/** Admin sign-in (0039): email and password, then a code from an authenticator app. */

export const ADMIN_SIGN_IN_MESSAGE = "That email and password don't match an admin account";
export const TOTP_CODE_MESSAGE = "Enter the 6-digit code from your authenticator app";

export const adminSignInSchema = z.object({
  // Trimmed before the check, so a pasted address with a stray space still signs in.
  email: z
    .string({ error: "Enter your email address" })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Enter your email address" })),
  password: z.string({ error: "Enter your password" }).min(1, "Enter your password").max(200),
});

export const totpCodeSchema = z.object({
  factorId: z.uuid({ error: "Start again from the sign-in page" }),
  code: z
    .string({ error: TOTP_CODE_MESSAGE })
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().length(6, TOTP_CODE_MESSAGE)),
});

export const ADMIN_PASSWORD_MIN = 12;
export const ADMIN_PASSWORD_MESSAGE = `Use at least ${ADMIN_PASSWORD_MIN} characters`;

export const adminPasswordSchema = z
  .object({
    password: z.string({ error: ADMIN_PASSWORD_MESSAGE }).min(ADMIN_PASSWORD_MIN, ADMIN_PASSWORD_MESSAGE).max(200),
    confirm: z.string({ error: "Type the new password again" }),
  })
  .refine((value) => value.password === value.confirm, { path: ["confirm"], message: "The two passwords don't match" });

export const adminNameSchema = z.object({
  name: z.string({ error: "Enter your name" }).trim().min(2, "Enter your name").max(80, "Keep it to 80 characters"),
});

export type AdminSignInInput = z.infer<typeof adminSignInSchema>;
export type TotpCodeInput = z.infer<typeof totpCodeSchema>;
