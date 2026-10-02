import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.types";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile) && !process.env.SUPABASE_SERVICE_ROLE_KEY) loadEnvFile(envFile);

/** Phone numbers with the fixed code 123456 (supabase/config.toml). Real SMS is never sent. */
export const PHONES = {
  driver: "+15555550100",
  carrier: "+15555550101",
  admin: "+15555550102",
  /** Extra numbers reserved for e2e tests that need a second driver. */
  secondDriver: "+15555550108",
} as const;

export const OTP = "123456";
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
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page).toHaveURL(/\/verify\?/);
}

/** Full login through the UI. Ends wherever the app routes the user. */
export async function login(page: Page, phone: string, loginPath = "/login") {
  await requestCode(page, phone, loginPath);
  await page.getByLabel("6-digit code").fill(OTP);
  await expect(page).not.toHaveURL(/\/verify/);
}

/** Validation and error messages inside the page. Excludes the Next.js route announcer. */
export const formAlert = (page: Page) => page.getByRole("main").getByRole("alert");

/** Picks a role card the way a person does, by tapping its label. */
export async function chooseRole(page: Page, role: "driver" | "carrier") {
  await page.getByText(role === "driver" ? "I'm a Driver" : "I'm a Carrier").click();
  await expect(
    page.getByRole("radio", { name: role === "driver" ? /I'm a Driver/ : /I'm a Carrier/ }),
  ).toBeChecked();
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
