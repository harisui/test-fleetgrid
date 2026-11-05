"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { POST as inboundWebhook } from "@/app/api/twilio/inbound/route";
import { devPhonesEnabled } from "@/lib/dev/phones";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createFakeDriversSchema, fakeReplySchema, type CreateFakeDriversInput } from "@/lib/validation/devPhones.schema";
import { smsProviderKind } from "@/server/container";
import { AppError, parseInput, runAction, type Result } from "@/server/errors/AppError";
import { DevPhonesRepository } from "@/server/repositories/DevPhonesRepository";
import { TWILIO_INBOUND_URL, twilioSignature } from "@/server/twilio/signature";

const PLACES = {
  pasadena: { city: "Pasadena", state: "TX", zip: "77506", lat: 29.7009, lng: -95.1989 },
  houston: { city: "Houston", state: "TX", zip: "77002", lat: 29.7594, lng: -95.3594 },
  dallas: { city: "Dallas", state: "TX", zip: "75201", lat: 32.7904, lng: -96.8044 },
} as const;

function refuseUnlessEnabled(): void {
  if (!devPhonesEnabled(getServerEnv(), smsProviderKind())) throw AppError.notFound();
}

function columnsFor(input: CreateFakeDriversInput) {
  const textsOn = input.texts !== "no_consent";
  return {
    cdl_state: "TX",
    operator_types: ["cdl_driver" as const],
    cdl_class: input.cdlClass,
    endorsements: input.endorsements ? (["H", "N", "T", "X"] as const).slice() : [],
    years_experience: 8,
    ...PLACES[input.place],
    transmission: "manual_ok" as const,
    equipment_types: ["dry_van" as const, "flatbed" as const],
    twic_active: input.twic !== "none",
    twic_expires_on: input.twic === "valid" ? "2099-12-31" : input.twic === "expired" ? "2020-01-01" : null,
    medical_card_active: true,
    mvr_status: "clean" as const,
    sms_opt_in: textsOn,
    sms_opt_in_at: textsOn ? new Date().toISOString() : null,
    sms_opt_in_text: textsOn ? "Simulated consent" : null,
    sms_opted_out: input.texts === "stopped",
    sms_opted_out_at: input.texts === "stopped" ? new Date().toISOString() : null,
    shifts_paused: input.paused,
    onboarding_step: 12,
    card_completed: true,
  };
}

/** Creates fake drivers with the chosen profile. Returns their numbers. */
export async function createFakeDriversAction(input: unknown): Promise<Result<string[]>> {
  return runAction(async () => {
    refuseUnlessEnabled();
    const values = parseInput(createFakeDriversSchema, input);
    const phones = new DevPhonesRepository(createAdminClient());
    const created: string[] = [];
    for (let n = 1; n <= values.count; n += 1) {
      created.push(await phones.createDriver(`Fake Driver ${randomUUID().slice(0, 4)}`, columnsFor(values), values.tier === "roster_ready"));
    }
    revalidatePath("/dev/phones");
    return created;
  });
}

/** A reply from a fake phone, signed and posted through the real webhook, as Twilio would. */
export async function sendFakeReplyAction(input: unknown): Promise<Result<void>> {
  return runAction(async () => {
    refuseUnlessEnabled();
    const { phone, body } = parseInput(fakeReplySchema, input);
    const token = getServerEnv().TWILIO_AUTH_TOKEN;
    if (!token) throw AppError.conflict("Set TWILIO_AUTH_TOKEN to any value locally: the webhook checks every signature.");
    const keyword = /^(stop|start|help)$/i.exec(body)?.[0]?.toUpperCase();
    const params: Record<string, string> = {
      MessageSid: `SMsim${randomUUID().replaceAll("-", "")}`,
      From: phone,
      To: "fake",
      Body: body,
      ...(keyword ? { OptOutType: keyword } : {}),
    };
    const response = await inboundWebhook(
      new Request(TWILIO_INBOUND_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSignature(token, TWILIO_INBOUND_URL, params) },
        body: new URLSearchParams(params),
      }),
    );
    if (!response.ok) throw AppError.conflict(`The webhook answered ${response.status}`);
    revalidatePath("/dev/phones");
  });
}
