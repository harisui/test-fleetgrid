-- 0002: core tables (Milestone 1)

-- Shared trigger: keeps updated_at current on every update.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  phone text not null unique,
  status public.account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_phone_e164 check (phone ~ '^\+[1-9]\d{7,14}$')
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- drivers: the qualification card
--
-- A partial row is created when onboarding step 1 (basics) is saved, so the
-- fields collected in later steps (operator types, experience, availability,
-- SMS consent) may be empty until then. drivers_card_complete guarantees that
-- card_completed can only be true once every required field is present.
-- ---------------------------------------------------------------------------
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  full_name text not null,
  operator_types public.operator_type[] not null default '{}',
  cdl_class public.cdl_class not null default 'none',
  endorsements public.endorsement[] not null default '{}',
  years_experience int,
  city text,
  state char(2) not null,
  zip text not null,
  service_radius_miles int not null default 50,
  availability public.availability_type[] not null default '{}',
  certifications text[] not null default '{}',
  bio text,
  sms_opt_in boolean not null default false,
  sms_opt_in_at timestamptz,
  sms_opt_in_text text,
  sms_opted_out boolean not null default false,
  sms_opted_out_at timestamptz,
  onboarding_step int not null default 1,
  card_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drivers_full_name_length check (char_length(btrim(full_name)) between 2 and 100),
  constraint drivers_years_experience_range check (years_experience between 0 and 60),
  constraint drivers_state_format check (state ~ '^[A-Z]{2}$'),
  constraint drivers_zip_format check (zip ~ '^\d{5}$'),
  constraint drivers_service_radius_range check (service_radius_miles between 5 and 500),
  constraint drivers_bio_length check (char_length(bio) <= 500),
  constraint drivers_onboarding_step_range check (onboarding_step between 1 and 6),
  constraint drivers_endorsements_need_cdl check (
    cdl_class <> 'none' or cardinality(endorsements) = 0
  ),
  constraint drivers_sms_opt_in_evidence check (
    not sms_opt_in or (sms_opt_in_at is not null and sms_opt_in_text is not null)
  ),
  constraint drivers_card_complete check (
    not card_completed
    or (
      cardinality(operator_types) > 0
      and years_experience is not null
      and cardinality(availability) > 0
      and sms_opt_in
    )
  )
);

create trigger drivers_set_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

create index drivers_state_idx on public.drivers (state);
create index drivers_zip_idx on public.drivers (zip);
create index drivers_operator_types_idx on public.drivers using gin (operator_types);
create index drivers_endorsements_idx on public.drivers using gin (endorsements);
create index drivers_availability_idx on public.drivers using gin (availability);

-- ---------------------------------------------------------------------------
-- driver_documents: metadata for files in the private driver-documents bucket
-- ---------------------------------------------------------------------------
create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  type public.document_type not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_documents_size_range check (size_bytes > 0 and size_bytes <= 10485760),
  constraint driver_documents_mime_allowed check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  )
);

create trigger driver_documents_set_updated_at
  before update on public.driver_documents
  for each row execute function public.set_updated_at();

create index driver_documents_driver_id_idx on public.driver_documents (driver_id);

-- ---------------------------------------------------------------------------
-- tos_acceptances: created now, used from Milestone 2
-- ---------------------------------------------------------------------------
create table public.tos_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tos_acceptances_profile_version_unique unique (profile_id, version)
);

create trigger tos_acceptances_set_updated_at
  before update on public.tos_acceptances
  for each row execute function public.set_updated_at();
