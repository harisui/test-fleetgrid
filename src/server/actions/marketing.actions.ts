"use server";

import { headers } from "next/headers";
import { getContactService } from "@/server/contact";
import { runAction, type Result } from "@/server/errors/AppError";

/** Sends a contact-form message to support. Open to anyone; the service rate-limits by address. */
export async function sendContactMessageAction(input: unknown): Promise<Result<{ email: string }>> {
  return runAction(async () => {
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : (requestHeaders.get("x-real-ip") ?? null);
    return getContactService().submit(input, { ip });
  });
}
