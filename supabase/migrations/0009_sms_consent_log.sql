-- ---------------------------------------------------------------------------
-- Proof of text-message consent and opt-outs, kept by phone number and never tied to an
-- account by a cascading key, so it survives "Delete my account". US texting rules want
-- FleetGrid able to show when a number agreed and when it said STOP.
--
-- Writes happen only through the service role (the app writes a row on every consent
-- event). Admins may read. Drivers, carriers and anonymous visitors see nothing.
-- ---------------------------------------------------------------------------

create type public.sms_consent_event as enum ('opt_in', 'opt_out', 'opt_in_again');
create type public.sms_consent_source as enum ('onboarding', 'sms_stop', 'sms_start', 'profile');

create table public.sms_consent_log (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  event public.sms_consent_event not null,
  consent_text text not null,
  -- The wording's version label, like 2026-10-v1 (SMS_CONSENT_VERSION in the app).
  consent_version text not null,
  source public.sms_consent_source not null,
  created_at timestamptz not null default now(),
  constraint sms_consent_log_phone_e164 check (phone ~ '^\+1[2-9][0-9]{9}$'),
  constraint sms_consent_log_text_present check (length(btrim(consent_text)) > 0),
  constraint sms_consent_log_version_present check (length(btrim(consent_version)) > 0)
);

comment on table public.sms_consent_log is
  'Append-only record of SMS consent events by phone number. Survives account deletion on purpose.';

create index sms_consent_log_phone_idx on public.sms_consent_log (phone, created_at desc);

alter table public.sms_consent_log enable row level security;

-- Nobody signed in may write; the service role bypasses RLS and is the only writer.
revoke all on public.sms_consent_log from anon, authenticated;
grant select on public.sms_consent_log to authenticated;

create policy sms_consent_log_select_admin on public.sms_consent_log
  for select to authenticated
  using ((select public.is_admin()));
