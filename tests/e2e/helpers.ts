import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.types";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile) && !process.env.SUPABASE_SERVICE_ROLE_KEY) loadEnvFile(envFile);

/**
 * Test numbers with a fixed code, from `[auth.sms.test_otp]` in supabase/config.toml. Real SMS
 * is never sent to them. TEST_PHONE_* and TEST_OTP in .env.local can point at other entries of
 * that table; the defaults are the ones checked in.
 */
export const PHONES = {
  driver: process.env.TEST_PHONE_DRIVER ?? "+15555550100",
  carrier: process.env.TEST_PHONE_CARRIER ?? "+15555550101",
  admin: process.env.TEST_PHONE_ADMIN ?? "+15555550102",
  /** Extra number reserved for e2e tests that need a second driver. */
  secondDriver: "+15555550108",
};

export const OTP = process.env.TEST_OTP ?? "123456";
export const WRONG_OTP = "000000";

type Role = Database["public"]["Enums"]["user_role"];
type Status = Database["public"]["Enums"]["account_status"];

/** Service role client for test setup only. Refuses to run against anything but local Supabase. */
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    throw new Error(`e2e tests must use local Supabase, got "${url}"`);
  }
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findUserId(phone: string): Promise<string | null> {
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  const bare = phone.replace(/^\+/, "");
  return data?.users.find((user) => user.phone === bare)?.id ?? null;
}

/** Deletes the auth user for a phone with their profile, card, documents and files. */
export async function resetUser(phone: string): Promise<void> {
  const admin = adminClient();
  const id = await findUserId(phone);
  if (!id) return;

  const { data: driver } = await admin
    .from("drivers")
    .select("id")
    .eq("profile_id", id)
    .maybeSingle();
  if (driver) {
    const bucket = admin.storage.from("driver-documents");
    const { data: files } = await bucket.list(driver.id);
    if (files?.length) await bucket.remove(files.map((file) => `${driver.id}/${file.name}`));
  }
  await admin.auth.admin.deleteUser(id);
}

/** Creates a confirmed user with a profile, without going through the UI. */
export async function seedUser(
  phone: string,
  role: Role,
  status: Status = "pending",
): Promise<string> {
  await resetUser(phone);
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ phone, phone_confirm: true });
  if (error || !data.user) throw new Error(`seedUser failed: ${error?.message}`);
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: data.user.id, phone, role, status });
  if (profileError) throw new Error(`seedUser profile failed: ${profileError.message}`);
  return data.user.id;
}

/** "+15555550100" -> "5555550100", what a person types. */
export const national = (phone: string) => phone.replace(/^\+1/, "");

/** "+15555550100" -> "(555) 555-0100", what the app shows. */
export const displayPhone = (phone: string) => {
  const digits = national(phone);
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

/** Supabase allows one code request per number per second locally. */
const lastRequestAt = new Map<string, number>();
async function respectResendInterval(phone: string) {
  const wait = (lastRequestAt.get(phone) ?? 0) + 1300 - Date.now();
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  lastRequestAt.set(phone, Date.now());
}

/** Enters the phone on /login and lands on /verify. */
export async function requestCode(page: Page, phone: string, loginPath = "/login") {
  await respectResendInterval(phone);
  await page.goto(loginPath);
  await page.getByLabel("Mobile number").fill(national(phone));
  await page.getByRole("button", { name: "Text me a code" }).click();
  await expect(page).toHaveURL(/\/verify\?/);
}

/**
 * Types a code into the verify screen. The field is cleared first: with ENABLE_TEST_LOGIN
 * it may already hold this very code, and filling the same value again changes nothing, so
 * the form would never submit.
 */
export async function enterCode(page: Page, code: string) {
  const field = page.getByLabel("6-digit code");
  await field.fill("");
  await field.fill(code);
}

/** Full login through the UI. Ends wherever the app routes the user. */
export async function login(page: Page, phone: string, loginPath = "/login") {
  await requestCode(page, phone, loginPath);
  await enterCode(page, OTP);
  await expect(page).not.toHaveURL(/\/verify/);
  // The app may redirect once more (for example profile to onboarding). Let it settle so a
  // following page.goto() does not interrupt a navigation that is still in flight.
  await page.waitForLoadState("networkidle");
}

/** Validation and error messages inside the page. Excludes the Next.js route announcer. */
export const formAlert = (page: Page) => page.getByRole("main").getByRole("alert");

/** Picks a role card the way a person does, by tapping its label. */
export async function chooseRole(page: Page, role: "driver" | "carrier") {
  const name = role === "driver" ? /I drive or work trucks/ : /I hire for my company/;
  await page.getByRole("radio", { name }).click();
  await expect(page.getByRole("radio", { name })).toHaveAttribute("aria-checked", "true");
}

/** Login for a number with no account yet, choosing a role. */
export async function signUp(page: Page, phone: string, role: "driver" | "carrier") {
  await resetUser(phone);
  await login(page, phone);
  await expect(page).toHaveURL(/\/choose-role/);
  await chooseRole(page, role);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).not.toHaveURL(/\/choose-role/);
}

/** Answers for every screen, used to seed a driver part-way through onboarding. */
export const CARD_ANSWERS = {
  full_name: "Pat Driver",
  city: "Dallas",
  state: "TX",
  zip: "75201",
  service_radius_miles: 50,
  operator_types: ["cdl_driver"] as const,
  years_experience: 8,
  availability: ["full_time"] as const,
  cdl_class: "A" as const,
  endorsements: ["H", "T"] as const,
  certifications: ["TWIC"],
  bio: "Reliable and on time.",
};

/**
 * Creates a driver who has answered every screen before `stepNumber` (1 to 13 from
 * src/lib/onboarding/steps.ts) and is about to see that screen. Step 13 is a completed card.
 */
export async function seedDriverAtStep(
  phone: string,
  stepNumber: number,
  overrides: Record<string, unknown> = {},
): Promise<{ userId: string; driverId: string | null }> {
  const userId = await seedUser(phone, "driver");
  if (stepNumber <= 1) return { userId, driverId: null };

  const row = { profile_id: userId, ...driverRowAtStep(stepNumber), ...overrides };
  const { data, error } = await adminClient().from("drivers").insert(row).select("id").single();
  if (error) throw new Error(`seedDriverAtStep failed: ${error.message}`);
  return { userId, driverId: data.id };
}

/** Moves an existing driver (seeded at step 2 or later) to another screen without a new login. */
export async function moveDriverToStep(
  phone: string,
  stepNumber: number,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const userId = await findUserId(phone);
  if (!userId) throw new Error(`moveDriverToStep: no user for ${phone}`);
  const { error } = await adminClient()
    .from("drivers")
    .update({ ...driverRowAtStep(stepNumber), ...overrides })
    .eq("profile_id", userId);
  if (error) throw new Error(`moveDriverToStep failed: ${error.message}`);
}

/** The card columns of a driver who is about to see screen `stepNumber`. Unanswered ones are null. */
function driverRowAtStep(stepNumber: number) {
  const answered = (screen: number) => stepNumber > screen;
  const complete = stepNumber >= 13;
  const or = <T>(condition: boolean, value: T) => (condition ? value : null);
  return {
    full_name: CARD_ANSWERS.full_name,
    city: or(answered(2), CARD_ANSWERS.city),
    state: or(answered(2), CARD_ANSWERS.state),
    zip: or(answered(2), CARD_ANSWERS.zip),
    ...(answered(3) && { service_radius_miles: CARD_ANSWERS.service_radius_miles }),
    operator_types: answered(4) ? [...CARD_ANSWERS.operator_types] : [],
    years_experience: or(answered(5), CARD_ANSWERS.years_experience),
    availability: answered(6) ? [...CARD_ANSWERS.availability] : [],
    cdl_class: answered(7) ? CARD_ANSWERS.cdl_class : ("none" as const),
    endorsements: answered(8) ? [...CARD_ANSWERS.endorsements] : [],
    certifications: answered(9) ? CARD_ANSWERS.certifications : [],
    bio: or(answered(11), CARD_ANSWERS.bio),
    sms_opt_in: complete,
    sms_opt_in_at: or(complete, new Date().toISOString()),
    sms_opt_in_text: or(complete, CONSENT_TEXT),
    card_completed: complete,
    onboarding_step: Math.min(stepNumber, 13),
  };
}

export const CONSENT_TEXT =
  "I agree to receive text messages from FleetGrid about available shifts at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.";

/** The main heading of the current screen. */
export const screenHeading = (page: Page) => page.getByRole("heading", { level: 1 });
export const nextButton = (page: Page, label = "Next") =>
  page.getByRole("button", { name: label, exact: true });

/** The phone layout: one question per screen. Wider viewports group a mile on one page. */
export const PHONE_VIEWPORT = { width: 390, height: 844 } as const;
export const DESKTOP_MIN_WIDTH = 768;

/** True when the onboarding groups a mile's questions on one page (viewport 768px and up). */
export const isGrouped = (page: Page) => (page.viewportSize()?.width ?? 0) >= DESKTOP_MIN_WIDTH;

/**
 * Asserts that a question is on screen, whichever layout is active: the sign title on phones,
 * a question heading or group label inside the mile on wider screens.
 */
export async function expectScreen(page: Page, question: string) {
  await expect(page.getByText(question, { exact: true }).first()).toBeVisible();
}

/** Signs in and opens the onboarding, even for a driver whose card is complete. */
export async function openOnboarding(page: Page, phone: string) {
  await login(page, phone);
  if (!/\/driver\/onboarding$/.test(page.url())) await page.goto("/driver/onboarding");
  await expect(page).toHaveURL(/\/driver\/onboarding$/);
}
