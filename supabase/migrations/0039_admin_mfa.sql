-- ---------------------------------------------------------------------------
-- 0039: admins sign in with email, password and an authenticator app (user decision of
-- 2026-11-15).
--
-- An admin acts as an admin only in a session that signed in with a password (the "amr"
-- claim names "password") and passed the authenticator step ("aal" is "aal2"). Anything
-- weaker, such as a phone code alone, or a phone code plus an authenticator, gets no admin
-- access: auth_role() answers null for it, so every rule that asks auth_role() = 'admin' or
-- is_admin() closes at once, and so does the admin's own audit entry.
--
-- The app sends such a session to /admin-sign-in or /admin-verify (src/lib/auth/guards.ts).
-- Drivers and carriers are unaffected.
-- ---------------------------------------------------------------------------

-- True when the current session signed in with a password and passed the second factor.
create function public.admin_session_strong()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
    and exists (
      select 1
      from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) as method
      where method ->> 'method' = 'password'
    );
$$;

comment on function public.admin_session_strong() is 'Password sign-in plus a passed authenticator step: what an admin session needs (0039).';

revoke execute on function public.admin_session_strong() from public, anon;
grant execute on function public.admin_session_strong() to authenticated, service_role;

-- The signed-in user's role; an admin without a strong session has none.
create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select case when p.role = 'admin' and not public.admin_session_strong() then null else p.role end
  from public.profiles p
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Admin accounts by email (same decision): an admin needs no phone number. A profile keeps a
-- phone for drivers and carriers; an admin profile may have an email instead. The audit log
-- names an admin by phone or by email.
-- ---------------------------------------------------------------------------
alter table public.profiles add column email text;
alter table public.profiles alter column phone drop not null;
alter table public.profiles add constraint profiles_email_format
  check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
alter table public.profiles add constraint profiles_contact
  check (phone is not null or (role = 'admin' and email is not null));
create unique index profiles_email_unique on public.profiles (lower(email)) where email is not null;

comment on column public.profiles.email is 'An admin''s sign-in email (0039). Drivers and carriers sign in by phone and have none.';

-- Nobody changes their own email; the service role sets it (.github/scripts/admin-login.mjs).
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_privileged() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Changing role is not allowed' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    raise exception 'Changing status is not allowed' using errcode = '42501';
  end if;
  if new.phone is distinct from old.phone or new.id is distinct from old.id then
    raise exception 'Changing phone is not allowed' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'Changing email is not allowed' using errcode = '42501';
  end if;
  if new.signup_utm_source is distinct from old.signup_utm_source
    or new.signup_utm_medium is distinct from old.signup_utm_medium
    or new.signup_utm_campaign is distinct from old.signup_utm_campaign
    or new.signup_utm_content is distinct from old.signup_utm_content
    or new.signup_referrer is distinct from old.signup_referrer
    or new.signup_landing_path is distinct from old.signup_landing_path
    or new.qr_link_id is distinct from old.qr_link_id then
    raise exception 'Changing the sign-up source is not allowed' using errcode = '42501';
  end if;

  return new;
end;
$$;

alter table public.admin_audit_log add column admin_email text;
alter table public.admin_audit_log alter column admin_phone drop not null;
alter table public.admin_audit_log drop constraint admin_audit_log_admin_phone_e164;
alter table public.admin_audit_log add constraint admin_audit_log_admin_phone_e164
  check (
    admin_phone is null
    or admin_phone ~ '^\+[1-9]\d{7,14}$'
    or (admin_phone = 'system' and admin_id = '00000000-0000-0000-0000-000000000000')
  );
alter table public.admin_audit_log add constraint admin_audit_log_admin_named
  check (admin_phone is not null or admin_email is not null);

comment on column public.admin_audit_log.admin_email is 'The admin''s email when the account has no phone (0039).';

-- The audit entry names the admin by phone or by email.
create or replace function public.write_admin_audit(p_action text, p_target_type text, p_target_id uuid, p_detail jsonb default '{}'::jsonb)
returns setof public.admin_audit_log
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles
  where id = (select auth.uid()) and role = 'admin' and status <> 'blocked' and public.admin_session_strong();
  if v_profile.id is null then
    raise exception 'Only admins write the audit log' using errcode = '42501';
  end if;
  return query
    insert into public.admin_audit_log (admin_id, admin_phone, admin_email, action, target_type, target_id, detail)
    values ((select auth.uid()), v_profile.phone, v_profile.email, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb))
    returning *;
end;
$$;
