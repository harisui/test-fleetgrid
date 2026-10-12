-- ---------------------------------------------------------------------------
-- 0015: the carrier side (Milestone 2, T2.1).
--
-- carriers: one row per carrier profile, created by the carrier onboarding form in one go
--   (company, contact, billing email, optional USDOT and MC, the yard ZIP with its city,
--   state and coordinates from the bundled dataset). The Stripe customer id is set by server
--   code only.
-- subscriptions: a mirror of the carrier's Stripe subscription, written by the webhook
--   through the service role. Access to driver cards needs one in 'active' or 'trialing'.
-- webhook_events: every Stripe event processed, keyed by its id, so a replay is a no-op.
-- carrier_waitlist: carriers whose yard is outside every active service area cannot
--   subscribe; they join this list with their ZIP so a future launch can find them.
--
-- Carriers read driver cards through RLS: only approved, complete, opted-in drivers inside an
-- active service area, and only while the carrier's subscription is active. The driver's
-- phone number lives on profiles, which carriers cannot read. Documents and files follow the
-- card: visible exactly when the card is.
--
-- search_drivers() filters and sorts the visible cards by distance from the yard. It runs as
-- the caller, so RLS decides what it can see.
-- ---------------------------------------------------------------------------

create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'
);

-- ---------------------------------------------------------------------------
-- carriers
-- ---------------------------------------------------------------------------
create table public.carriers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  company_name text not null,
  contact_name text not null,
  billing_email text not null,
  usdot text,
  mc text,
  city text not null,
  state char(2) not null,
  zip text not null,
  lat numeric(8, 5) not null,
  lng numeric(8, 5) not null,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carriers_company_name_length check (char_length(btrim(company_name)) between 2 and 120),
  constraint carriers_contact_name_length check (char_length(btrim(contact_name)) between 2 and 100),
  constraint carriers_billing_email_format check (billing_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint carriers_usdot_format check (usdot is null or usdot ~ '^\d{1,8}$'),
  constraint carriers_mc_format check (mc is null or mc ~ '^\d{1,8}$'),
  constraint carriers_state_format check (state ~ '^[A-Z]{2}$'),
  constraint carriers_zip_format check (zip ~ '^\d{5}$'),
  constraint carriers_lat_range check (lat between -90 and 90),
  constraint carriers_lng_range check (lng between -180 and 180)
);

comment on table public.carriers is 'A carrier company: who they are, how to bill them, and where their yard is.';
comment on column public.carriers.zip is 'The yard ZIP. City, state, lat and lng come from the bundled dataset for it.';
comment on column public.carriers.stripe_customer_id is 'Set by server code when checkout starts; never by the carrier.';

create trigger carriers_set_updated_at
  before update on public.carriers
  for each row execute function public.set_updated_at();

create index carriers_zip_idx on public.carriers (zip);

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references public.carriers (id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  status public.subscription_status not null,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is 'Mirror of each carrier''s Stripe subscription, kept current by the webhook.';

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create index subscriptions_carrier_id_idx on public.subscriptions (carrier_id);
create index subscriptions_status_idx on public.subscriptions (status);

-- ---------------------------------------------------------------------------
-- webhook_events: idempotency for Stripe
-- ---------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  event_id text not null,
  type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_events_provider_event_unique unique (provider, event_id),
  constraint webhook_events_event_id_present check (length(btrim(event_id)) > 0)
);

comment on table public.webhook_events is 'Every provider event handled once. A second delivery of the same id does nothing.';

create trigger webhook_events_set_updated_at
  before update on public.webhook_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- carrier_waitlist
-- ---------------------------------------------------------------------------
create table public.carrier_waitlist (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null unique references public.carriers (id) on delete cascade,
  zip text not null,
  lat numeric(8, 5) not null,
  lng numeric(8, 5) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carrier_waitlist_zip_format check (zip ~ '^\d{5}$'),
  constraint carrier_waitlist_lat_range check (lat between -90 and 90),
  constraint carrier_waitlist_lng_range check (lng between -180 and 180)
);

comment on table public.carrier_waitlist is 'Carriers whose yard was outside every active area when they tried to subscribe.';

create trigger carrier_waitlist_set_updated_at
  before update on public.carrier_waitlist
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create function public.current_carrier_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.carriers where profile_id = auth.uid();
$$;

-- True while the signed-in carrier's subscription is active or trialing.
create function public.carrier_has_active_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    join public.carriers c on c.id = s.carrier_id
    where c.profile_id = auth.uid()
      and s.status in ('active', 'trialing')
  );
$$;

-- The review status of any profile, for policies that must look past the profiles RLS.
create function public.profile_status(p_profile_id uuid)
returns public.account_status
language sql
stable
security definer
set search_path = public
as $$
  select status from public.profiles where id = p_profile_id;
$$;

-- Carriers cannot move a carrier row to another profile or set its Stripe customer id.
create function public.protect_carrier_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_privileged() then
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id or new.id is distinct from old.id then
    raise exception 'Changing the carrier owner is not allowed' using errcode = '42501';
  end if;
  if new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'Changing the billing customer is not allowed' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger carriers_protect_columns
  before update on public.carriers
  for each row execute function public.protect_carrier_columns();

revoke execute on function public.current_carrier_id() from public, anon;
revoke execute on function public.carrier_has_active_subscription() from public, anon;
revoke execute on function public.profile_status(uuid) from public, anon;
grant execute on function public.current_carrier_id() to authenticated, service_role;
grant execute on function public.carrier_has_active_subscription() to authenticated, service_role;
grant execute on function public.profile_status(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- | Table            | Carrier                       | Driver | Admin      | Service role |
-- | carriers         | select/insert/update own      | none   | all        | all          |
-- | subscriptions    | select own                    | none   | select all | all          |
-- | webhook_events   | none                          | none   | none       | all          |
-- | carrier_waitlist | select/insert own             | none   | select all | all          |
-- | drivers          | select listed, while subscribed (added below)                      |
-- | driver_documents | select those of listed drivers (added below)                       |
-- ---------------------------------------------------------------------------
alter table public.carriers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.webhook_events enable row level security;
alter table public.carrier_waitlist enable row level security;

revoke all on public.carriers, public.subscriptions, public.webhook_events, public.carrier_waitlist
  from anon, authenticated;
grant select, insert, update on public.carriers to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert on public.carrier_waitlist to authenticated;

create policy carriers_select_own_or_admin on public.carriers
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

create policy carriers_insert_own on public.carriers
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (select public.auth_role()) = 'carrier'
    and stripe_customer_id is null
  );

create policy carriers_insert_admin on public.carriers
  for insert to authenticated
  with check ((select public.is_admin()));

create policy carriers_update_own_or_admin on public.carriers
  for update to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()))
  with check (profile_id = (select auth.uid()) or (select public.is_admin()));

create policy subscriptions_select_own_or_admin on public.subscriptions
  for select to authenticated
  using (carrier_id = (select public.current_carrier_id()) or (select public.is_admin()));

create policy carrier_waitlist_select_own_or_admin on public.carrier_waitlist
  for select to authenticated
  using (carrier_id = (select public.current_carrier_id()) or (select public.is_admin()));

create policy carrier_waitlist_insert_own on public.carrier_waitlist
  for insert to authenticated
  with check (carrier_id = (select public.current_carrier_id()));

-- A subscribed carrier sees the listed cards: approved, complete, opted in and not opted
-- out, with a ZIP inside an active service area. Nothing else about a driver is readable:
-- the phone number is on profiles, which stay closed to carriers.
create policy drivers_select_subscribed_carrier on public.drivers
  for select to authenticated
  using (
    (select public.auth_role()) = 'carrier'
    and (select public.carrier_has_active_subscription())
    and card_completed
    and sms_opt_in
    and not sms_opted_out
    and public.profile_status(profile_id) = 'approved'
    and lat is not null
    and lng is not null
    and public.is_in_service_area(lat::double precision, lng::double precision)
  );

-- Documents follow the card: the subquery runs under the caller's own drivers policies.
create policy driver_documents_select_subscribed_carrier on public.driver_documents
  for select to authenticated
  using (
    (select public.auth_role()) = 'carrier'
    and exists (select 1 from public.drivers d where d.id = driver_documents.driver_id)
  );

-- And so do the files: a signed URL can be made only for a folder of a visible card.
create policy driver_documents_objects_select_subscribed_carrier on storage.objects
  for select to authenticated
  using (
    bucket_id = 'driver-documents'
    and (select public.auth_role()) = 'carrier'
    and exists (
      select 1 from public.drivers d where d.id::text = (storage.foldername(name))[1]
    )
  );

-- ---------------------------------------------------------------------------
-- Driver search: the cards the caller may see, within p_radius_miles of the yard, filtered
-- and sorted by distance. Runs as the caller (security invoker), so RLS does the gating.
--
-- p_cdl_class: the lowest class that will do. 'B' matches A and B; 'A' matches A only
--   (the enum is ordered A, B, none).
-- p_endorsements, p_equipment: every listed value must be on the card.
-- p_manual: true means the driver must drive a manual.
-- p_mvr_max: the worst record that will do. 'clean' means clean only; 'minor_1_2' means
--   clean or 1 or 2 minor; null means any.
-- ---------------------------------------------------------------------------
create function public.search_drivers(
  p_lat double precision,
  p_lng double precision,
  p_radius_miles integer,
  p_cdl_class public.cdl_class default null,
  p_endorsements public.endorsement[] default '{}',
  p_min_years integer default null,
  p_twic boolean default null,
  p_medical boolean default null,
  p_manual boolean default null,
  p_equipment public.equipment_type[] default '{}',
  p_mvr_max public.mvr_status default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (driver_id uuid, distance_miles numeric, total_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with matches as (
    select d.id,
           round(public.miles_between(p_lat, p_lng, d.lat::double precision, d.lng::double precision)::numeric, 1)
             as distance_miles
    from public.drivers d
    where d.lat is not null
      and d.lng is not null
      and round(public.miles_between(p_lat, p_lng, d.lat::double precision, d.lng::double precision)::numeric, 3)
        <= p_radius_miles
      and (p_cdl_class is null or d.cdl_class <= p_cdl_class)
      and d.endorsements @> coalesce(p_endorsements, '{}')
      and (p_min_years is null or d.years_experience >= p_min_years)
      and (p_twic is null or d.twic_active = p_twic)
      and (p_medical is null or d.medical_card_active = p_medical)
      and (p_manual is not true or d.transmission = 'manual_ok')
      and d.equipment_types @> coalesce(p_equipment, '{}')
      and (p_mvr_max is null or d.mvr_status <= p_mvr_max)
  )
  select id, distance_miles, count(*) over () as total_count
  from matches
  order by distance_miles asc, id asc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.search_drivers(
  double precision, double precision, integer, public.cdl_class, public.endorsement[], integer,
  boolean, boolean, boolean, public.equipment_type[], public.mvr_status, integer, integer
) from public, anon;
grant execute on function public.search_drivers(
  double precision, double precision, integer, public.cdl_class, public.endorsement[], integer,
  boolean, boolean, boolean, public.equipment_type[], public.mvr_status, integer, integer
) to authenticated, service_role;
