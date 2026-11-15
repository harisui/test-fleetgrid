#!/usr/bin/env node
/**
 * Admin accounts (0039): admins sign in with email, password and an authenticator app, and
 * need no phone number.
 *
 *   create     a new admin, by email only:
 *              node .github/scripts/admin-login.mjs create --email name@example.com --name "Annie Hetzler"
 *   set        a new temporary password (and an email, for an older phone-based admin):
 *              node .github/scripts/admin-login.mjs set --email name@example.com
 *              node .github/scripts/admin-login.mjs set --phone +15555550102 --email name@example.com
 *   reset-2fa  removes the authenticator (a lost phone); a new one is set up at the next sign-in:
 *              node .github/scripts/admin-login.mjs reset-2fa --email name@example.com
 *
 * It reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local, so it works
 * on the local database by default. For production, set both inline before the command. The
 * first line printed names the project, so check it before anything else.
 *
 * The temporary password is printed once: give it to the admin privately. They sign in at
 * /admin-sign-in, set up the authenticator app, then change the password.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";

// .env.local when present; values set in the environment win.
try {
  for (const [name, value] of Object.entries(parseEnv(readFileSync(".env.local", "utf8")))) process.env[name] ??= value;
} catch {
  // No .env.local: the environment must carry the two values.
}

const [command, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const at = rest.indexOf(`--${name}`);
  return at === -1 ? undefined : rest[at + 1];
};
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
const isEmail = (value) => typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
// 18 random bytes: 24 characters of letters, digits, - and _.
const temporaryPassword = () => randomBytes(18).toString("base64url");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
console.log(`Project: ${new URL(url).host}`);

const email = flag("email")?.trim().toLowerCase();
const phone = flag("phone");
if (email !== undefined && !isEmail(email)) fail("That email does not look right.");
if (phone !== undefined && !/^\+1\d{10}$/.test(phone)) fail("The phone must look like +1XXXXXXXXXX.");

/** The admin profile named by --phone, or else by --email. */
async function findAdmin() {
  const query = supabase.from("profiles").select("id, role, phone, email");
  const lookup = phone ? query.eq("phone", phone) : email ? query.ilike("email", email) : null;
  if (!lookup) fail("Name the admin with --email (or --phone for an older account).");
  const { data, error } = await lookup.maybeSingle();
  if (error) fail(`Could not read the profile: ${error.message}`);
  if (!data) fail(`No account found for ${phone ?? email}.`);
  if (data.role !== "admin") fail(`${phone ?? email} is not an admin account (role: ${data.role}).`);
  return data;
}

function printSignIn(address, password) {
  console.log(`  email:              ${address}`);
  console.log(`  temporary password: ${password}`);
  console.log("They sign in at /admin-sign-in, set up an authenticator app, then change the password.");
}

if (command === "create") {
  if (!email) fail("Give the new admin's email: --email name@example.com");
  const name = flag("name")?.trim() || null;
  const password = temporaryPassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: name ? { full_name: name } : {},
  });
  if (error || !data.user) fail(`Could not create the account: ${error?.message}`);
  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ id: data.user.id, role: "admin", status: "approved", email });
  if (profileError) {
    await supabase.auth.admin.deleteUser(data.user.id);
    fail(`Could not create the admin profile: ${profileError.message}`);
  }
  console.log(`Done. A new admin account${name ? ` for ${name}` : ""}:`);
  printSignIn(email, password);
} else if (command === "set") {
  const profile = await findAdmin();
  const address = email ?? profile.email;
  if (!address) fail("This admin has no email yet: add --email name@example.com");
  const password = temporaryPassword();
  const { error } = await supabase.auth.admin.updateUserById(profile.id, { email: address, email_confirm: true, password });
  if (error) fail(`Could not update the account: ${error.message}`);
  const { error: profileError } = await supabase.from("profiles").update({ email: address }).eq("id", profile.id);
  if (profileError) fail(`Could not save the email on the profile: ${profileError.message}`);
  console.log("Done. New sign-in details:");
  printSignIn(address, password);
} else if (command === "reset-2fa") {
  const profile = await findAdmin();
  const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: profile.id });
  if (error) fail(`Could not read the authenticators: ${error.message}`);
  for (const factor of data.factors) {
    const { error: deleteError } = await supabase.auth.admin.mfa.deleteFactor({ userId: profile.id, id: factor.id });
    if (deleteError) fail(`Could not remove an authenticator: ${deleteError.message}`);
  }
  console.log(`Done. Removed ${data.factors.length} authenticator(s). A new one is set up at the next sign-in.`);
} else {
  fail("Use: create --email ... [--name ...]   set --email ... (or --phone ...)   reset-2fa --email ...");
}
