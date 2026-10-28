import "server-only";
import { cookies } from "next/headers";
import { normalizeUsPhone } from "@/lib/phone";

/**
 * The number a login code was just sent to, carried from the login screen to the code
 * screen in a first-party, httpOnly cookie. It used to ride in the address (/verify?phone=),
 * where every script on the page, the Google Ads tag included, saw it and sent it on. The
 * cookie is readable only by the server, lives ten minutes (a code expires sooner), and is
 * cleared once the code is accepted.
 */
export const PENDING_PHONE_COOKIE = "fg_otp_phone";
export const PENDING_PHONE_MAX_AGE_SECONDS = 10 * 60;

export async function setPendingPhone(phone: string): Promise<void> {
  const jar = await cookies();
  jar.set(PENDING_PHONE_COOKIE, phone, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_PHONE_MAX_AGE_SECONDS,
  });
}

/** The pending number in E.164, or null when there is none or it is not a US number. */
export async function readPendingPhone(): Promise<string | null> {
  const raw = (await cookies()).get(PENDING_PHONE_COOKIE)?.value;
  return raw ? normalizeUsPhone(raw) : null;
}

export async function clearPendingPhone(): Promise<void> {
  (await cookies()).delete(PENDING_PHONE_COOKIE);
}
