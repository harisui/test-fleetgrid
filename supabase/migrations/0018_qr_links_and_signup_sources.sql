-- Milestone 3, parts 3 and 4 (client brief of 2026-10-28): the QR codes on the flyers, their
-- scans, and where each sign-up came from.

-- ---------------------------------------------------------------------------
-- How a driver says they heard of FleetGrid (an optional question at the end of sign-up).
-- ---------------------------------------------------------------------------
create type public.heard_from as enum (
  'flyer',
  'facebook_instagram',
  'google_search',
  'friend_coworker',
  'other'
);

-- ---------------------------------------------------------------------------
-- qr_links: one per printed code. The printed code carries the short link /q/<slug>, never
-- the long UTM address, so the destination can change later without reprinting.
-- ---------------------------------------------------------------------------
create table public.qr_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  location_name text not null,
  campaign text not null,
  target_path text not null default '/',
  utm_source text not null default 'flyer',
  utm_medium text not null default 'qr',
  is_active boolean not null default true,
  -- The admin who made it. No foreign key: the record outlives the account.
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_links_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  constraint qr_links_location_name_length check (char_length(btrim(location_name)) between 2 and 80),
  constraint qr_links_campaign_format check (campaign ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(campaign) between 2 and 60),
  constraint qr_links_target_path_format check (target_path ~ '^/[a-z0-9/-]*$'),
  constraint qr_links_utm_source_format check (utm_source ~ '^[a-z0-9_-]{1,40}$'),
  constraint qr_links_utm_medium_format check (utm_medium ~ '^[a-z0-9_-]{1,40}$')
);

create index qr_links_campaign_idx on public.qr_links (campaign);

create trigger qr_links_set_updated_at
  before update on public.qr_links
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- qr_scans: one row per visit to a short link. The IP is stored hashed with a server-side
-- salt, never raw.
-- ---------------------------------------------------------------------------
create table public.qr_scans (
  id uuid primary key default gen_random_uuid(),
  qr_link_id uuid not null references public.qr_links (id) on delete cascade,
  scanned_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  constraint qr_scans_ip_hash_format check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  constraint qr_scans_user_agent_length check (char_length(user_agent) <= 500)
);

create index qr_scans_link_idx on public.qr_scans (qr_link_id, scanned_at desc);

-- ---------------------------------------------------------------------------
-- Where a sign-up came from: first-touch UTM tags, the referrer and the landing path, kept
-- from a first-party cookie when the profile is created, plus the QR code when the
-- utm_content names one. Set once; only admins and the service role may change them.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column signup_utm_source text,
  add column signup_utm_medium text,
  add column signup_utm_campaign text,
  add column signup_utm_content text,
  add column signup_referrer text,
  add column signup_landing_path text,
  add column qr_link_id uuid references public.qr_links (id) on delete set null,
  add constraint profiles_signup_utm_source_length check (char_length(signup_utm_source) <= 200),
  add constraint profiles_signup_utm_medium_length check (char_length(signup_utm_medium) <= 200),
  add constraint profiles_signup_utm_campaign_length check (char_length(signup_utm_campaign) <= 200),
  add constraint profiles_signup_utm_content_length check (char_length(signup_utm_content) <= 200),
  add constraint profiles_signup_referrer_length check (char_length(signup_referrer) <= 500),
  add constraint profiles_signup_landing_path_length check (char_length(signup_landing_path) <= 500);

create index profiles_qr_link_idx on public.profiles (qr_link_id);

alter table public.drivers
  add column heard_from public.heard_from,
  add column heard_from_other text,
  add constraint drivers_heard_from_other_length check (char_length(heard_from_other) <= 80);

-- Users may never change their own role, status or phone, nor rewrite where they came from.
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

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- | Table    | Admin                       | Driver, carrier | Anon | Service role |
-- | qr_links | select, insert own, update  | none            | none | all          |
-- | qr_scans | select                      | none            | none | all          |
-- ---------------------------------------------------------------------------
alter table public.qr_links enable row level security;
alter table public.qr_scans enable row level security;
revoke all on public.qr_links, public.qr_scans from anon, authenticated;
grant select, insert, update on public.qr_links to authenticated;
grant select on public.qr_scans to authenticated;

create policy qr_links_select_admin on public.qr_links
  for select to authenticated
  using ((select public.is_admin()));

create policy qr_links_insert_admin on public.qr_links
  for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

create policy qr_links_update_admin on public.qr_links
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy qr_scans_select_admin on public.qr_scans
  for select to authenticated
  using ((select public.is_admin()));
