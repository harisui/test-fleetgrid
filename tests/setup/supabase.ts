import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { buildPhone } from "./factories";

/**
 * Helpers for integration tests against the local Supabase stack.
 *
 * Users are created through the admin API with a phone and a random password, then signed in
 * with that password. This gives a real session (JWT with the phone claim) without sending or
 * rate-limiting SMS codes. The OTP flow itself is covered by e2e tests.
 */

export type TypedClient = SupabaseClient<Database>;
type Role = Database["public"]["Enums"]["user_role"];
type Status = Database["public"]["Enums"]["account_status"];

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export const DOCUMENTS_BUCKET = "driver-documents";

/** Bypasses RLS. Test setup and assertions only. */
export function serviceClient(): TypedClient {
  return createClient<Database>(url(), serviceKey(), noSession);
}

/** A visitor who is not signed in. */
export function anonClient(): TypedClient {
  return createClient<Database>(url(), anonKey(), noSession);
}

export interface TestUser {
  id: string;
  phone: string;
  /** Client signed in as this user (RLS applies). */
  client: TypedClient;
}

interface CreateUserOptions {
  /** Creates a profile row with this role. Omit for a signed-in user without a profile. */
  role?: Role;
  status?: Status;
}

const createdUserIds: string[] = [];

/** Registers a user created outside this module (for example by a real OTP sign-in) for cleanup. */
export function trackUserForCleanup(id: string): void {
  createdUserIds.push(id);
}

/** A fresh client with no session and an in-memory session store, like a new browser. */
export function freshClient(): TypedClient {
  return createClient<Database>(url(), anonKey(), noSession);
}

/** Removes any auth user that owns this phone, so OTP tests start clean. */
export async function deleteUserByPhone(phone: string): Promise<void> {
  const admin = serviceClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const bare = phone.replace(/^\+/, "");
  for (const user of data?.users ?? []) {
    if (user.phone === bare) await admin.auth.admin.deleteUser(user.id);
  }
}

export async function createTestUser(options: CreateUserOptions = {}): Promise<TestUser> {
  const admin = serviceClient();
  const phone = buildPhone();
  const password = `pw-${randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  const id = data.user.id;
  createdUserIds.push(id);

  if (options.role) {
    const { error: profileError } = await admin
      .from("profiles")
      .insert({ id, phone, role: options.role, status: options.status ?? "pending" });
    if (profileError) throw new Error(`profile insert failed: ${profileError.message}`);
  }

  const client = createClient<Database>(url(), anonKey(), noSession);
  const { error: signInError } = await client.auth.signInWithPassword({ phone, password });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);

  return { id, phone, client };
}

export interface TestDriver extends TestUser {
  driverId: string;
}

/** A driver with a saved step 1 card. */
export async function createTestDriver(
  options: { status?: Status; fullName?: string } = {},
): Promise<TestDriver> {
  const user = await createTestUser({ role: "driver", status: options.status });
  const { data, error } = await serviceClient()
    .from("drivers")
    .insert({
      profile_id: user.id,
      full_name: options.fullName ?? "Test Driver",
      city: "Dallas",
      state: "TX",
      zip: "75201",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`driver insert failed: ${error?.message}`);
  return { ...user, driverId: data.id };
}

/** ZIP centres from src/data/us-zips.tsv: inside the launch areas (Houston, Pasadena) and outside (Dallas). */
export const TEST_PLACES = {
  houston: { city: "Houston", state: "TX", zip: "77002", lat: 29.7594, lng: -95.3594 },
  pasadena: { city: "Pasadena", state: "TX", zip: "77506", lat: 29.7009, lng: -95.1989 },
  dallas: { city: "Dallas", state: "TX", zip: "75201", lat: 32.7904, lng: -96.8044 },
} as const;

type Place = (typeof TEST_PLACES)[keyof typeof TEST_PLACES];
type DriverInsert = Database["public"]["Tables"]["drivers"]["Insert"];

/**
 * A driver a subscribed carrier can see: approved, complete, opted in, inside a launch area.
 * Override any column, for example to make the card pending, opted out or out of area.
 */
export async function createListedDriver(
  options: { fullName?: string; place?: Place; status?: Status } & Partial<DriverInsert> = {},
): Promise<TestDriver> {
  const { fullName, place = TEST_PLACES.houston, status = "approved", ...columns } = options;
  const user = await createTestUser({ role: "driver", status });
  const { data, error } = await serviceClient()
    .from("drivers")
    .insert({
      profile_id: user.id,
      full_name: fullName ?? "Listed Driver",
      operator_types: ["cdl_driver"],
      cdl_class: "A",
      endorsements: ["H", "N", "T", "X"],
      years_experience: 8,
      city: place.city,
      state: place.state,
      zip: place.zip,
      lat: place.lat,
      lng: place.lng,
      transmission: "manual_ok",
      equipment_types: ["dry_van", "flatbed"],
      twic_active: true,
      medical_card_active: true,
      mvr_status: "clean",
      sms_opt_in: true,
      sms_opt_in_at: new Date().toISOString(),
      sms_opt_in_text: "I agree",
      onboarding_step: 12,
      card_completed: true,
      ...columns,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`listed driver insert failed: ${error?.message}`);
  return { ...user, driverId: data.id };
}

export interface TestCarrier extends TestUser {
  carrierId: string;
}

/** A carrier with a company row at the given yard, and optionally a subscription in the given status. */
export async function createTestCarrier(
  options: {
    place?: Place;
    status?: Status;
    subscription?: Database["public"]["Enums"]["subscription_status"] | null;
    companyName?: string;
  } = {},
): Promise<TestCarrier> {
  const { place = TEST_PLACES.houston, status = "approved", subscription = null } = options;
  const user = await createTestUser({ role: "carrier", status });
  const admin = serviceClient();
  const customerId = subscription ? `cus_test_${randomUUID().slice(0, 8)}` : null;
  const { data, error } = await admin
    .from("carriers")
    .insert({
      profile_id: user.id,
      company_name: options.companyName ?? "Test Freight",
      contact_name: "Test Owner",
      billing_email: `billing-${randomUUID().slice(0, 8)}@example.com`,
      city: place.city,
      state: place.state,
      zip: place.zip,
      lat: place.lat,
      lng: place.lng,
      stripe_customer_id: customerId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`carrier insert failed: ${error?.message}`);
  if (subscription) {
    const { error: subscriptionError } = await admin.from("subscriptions").insert({
      carrier_id: data.id,
      stripe_subscription_id: `sub_test_${randomUUID().slice(0, 8)}`,
      stripe_customer_id: customerId!,
      status: subscription,
      current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    if (subscriptionError) throw new Error(`subscription insert failed: ${subscriptionError.message}`);
  }
  return { ...user, carrierId: data.id };
}

/** Deletes every user created through this module, with their rows and files. */
export async function cleanupTestUsers(): Promise<void> {
  const admin = serviceClient();
  const ids = createdUserIds.splice(0);
  if (ids.length === 0) return;

  const { data: drivers } = await admin.from("drivers").select("id").in("profile_id", ids);
  for (const driver of drivers ?? []) {
    const { data: files } = await admin.storage.from(DOCUMENTS_BUCKET).list(driver.id);
    if (files && files.length > 0) {
      await admin.storage
        .from(DOCUMENTS_BUCKET)
        .remove(files.map((file) => `${driver.id}/${file.name}`));
    }
  }

  // The audit log has no foreign key (it outlives accounts on purpose): clear what these
  // users wrote or were the target of, so nothing piles up between runs.
  const driverIds = (drivers ?? []).map((driver) => driver.id);
  await admin.from("admin_audit_log").delete().in("admin_id", ids);
  if (driverIds.length > 0) await admin.from("admin_audit_log").delete().in("target_id", driverIds);

  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`deleteUser failed: ${error.message}`);
  }
}

/** Small valid files for upload tests. */
export const TEST_FILES = {
  // 1x1 transparent PNG
  png: () =>
    new Blob(
      [
        Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
          ),
          (char) => char.charCodeAt(0),
        ),
      ],
      { type: "image/png" },
    ),
  pdf: () => new Blob(["%PDF-1.4\n%%EOF\n"], { type: "application/pdf" }),
  text: () => new Blob(["hello"], { type: "text/plain" }),
};
