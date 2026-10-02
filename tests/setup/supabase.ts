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
