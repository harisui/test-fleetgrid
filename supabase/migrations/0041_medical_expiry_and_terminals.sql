-- ---------------------------------------------------------------------------
-- 0041: the medical card expiry date, terminal experience, and one text before a card expires
-- (Annie, 2026-11-16).
--
-- - drivers.medical_card_expires_on: self-reported, asked when the driver says they have a
--   medical card. A passed date adds 'medical_card_expired' to shift_ready_missing(), so the
--   driver gets no shift offers and is not listed to carriers until a new date is entered (a
--   Roster-Ready driver keeps the status; the line shows on their page and in the admin). No date
--   yet means unknown, never expired, so drivers who signed up before this keep working.
-- - drivers.terminals and drivers.container_skills: optional, self-reported, on the profile only.
-- - carrier_driver_cards() returns the three new columns.
-- - driver_expiry_notices and claim_expiry_notices(): one text about 30 days before the medical
--   card or the TWIC expires, once per date, never within a week of another reminder text
--   (reminded_recently() counts these too). Service role only.
-- ---------------------------------------------------------------------------

create type public.terminal as enum ('barbours_cut', 'bayport', 'rail_ramp');
create type public.container_skill as enum ('chassis', 'container_20', 'container_40');

alter table public.drivers
  add column medical_card_expires_on date,
  add column terminals public.terminal[] not null default '{}',
  add column container_skills public.container_skill[] not null default '{}';

comment on column public.drivers.medical_card_expires_on is 'Self-reported. A passed date stops shift offers (0041); null is unknown, not expired.';
comment on column public.drivers.terminals is 'Optional, self-reported: terminals the driver has worked (0041).';
comment on column public.drivers.container_skills is 'Optional, self-reported: chassis and container sizes the driver has handled (0041).';

-- What keeps a driver from Shift-Ready, now with an expired medical card.
create or replace function public.shift_ready_missing(p_driver_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    case when not exists (select 1 from public.driver_documents x where x.driver_id = d.id and x.type = 'cdl_front') then 'cdl_front' end,
    case when not exists (select 1 from public.driver_documents x where x.driver_id = d.id and x.type = 'cdl_back') then 'cdl_back' end,
    case when not exists (select 1 from public.driver_documents x where x.driver_id = d.id and x.type = 'medical_card') then 'medical_card' end,
    case when d.medical_card_expires_on < (now() at time zone 'America/Chicago')::date then 'medical_card_expired' end,
    case when d.cdl_state is distinct from 'TX' and d.shift_ready_override_reason is null then 'cdl_state' end,
    case when coalesce(array_length(regexp_split_to_array(btrim(d.full_name), '\s+'), 1), 0) < 2 then 'last_name' end,
    case when not d.card_completed then 'profile' end
  ], null)
  from public.drivers d
  where d.id = p_driver_id;
$$;

-- The carrier's card, with the medical card date and the terminal experience.
drop function public.carrier_driver_cards(uuid[]);

create function public.carrier_driver_cards(p_driver_ids uuid[])
returns table (
  id uuid,
  full_name text,
  cdl_class public.cdl_class,
  endorsements public.endorsement[],
  years_experience integer,
  city text,
  state text,
  zip text,
  service_radius_miles integer,
  lat numeric,
  lng numeric,
  availability public.availability_type[],
  certifications text[],
  bio text,
  employment_type public.employment_type,
  driving_styles public.driving_style[],
  transmission public.transmission_type,
  equipment_types public.equipment_type[],
  twic_active boolean,
  twic_expires_on date,
  medical_card_active boolean,
  medical_card_expires_on date,
  terminals public.terminal[],
  container_skills public.container_skill[],
  clearinghouse_registered boolean,
  mvr_status public.mvr_status,
  sms_opt_in boolean,
  sms_opted_out boolean,
  roster_grace_until timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.full_name, d.cdl_class, d.endorsements, d.years_experience, d.city, d.state::text, d.zip,
    d.service_radius_miles, d.lat, d.lng, d.availability, d.certifications, d.bio, d.employment_type,
    d.driving_styles, d.transmission, d.equipment_types, d.twic_active, d.twic_expires_on,
    d.medical_card_active, d.medical_card_expires_on, d.terminals, d.container_skills,
    d.clearinghouse_registered, d.mvr_status, d.sms_opt_in, d.sms_opted_out, d.roster_grace_until
  from public.drivers d
  where d.id = any (coalesce(p_driver_ids, '{}'))
    and (select public.auth_role()) = 'carrier'::public.user_role
      and (select public.carrier_has_active_subscription())
      and d.card_completed
      and public.is_shift_ready(d.id)
      and d.lat is not null
      and d.lng is not null
      and public.is_in_service_area(d.lat::double precision, d.lng::double precision);
$$;

revoke execute on function public.carrier_driver_cards(uuid[]) from public, anon;
grant execute on function public.carrier_driver_cards(uuid[]) to authenticated;

-- Expiry texts ----------------------------------------------------------------

create table public.driver_expiry_notices (
  driver_id uuid not null references public.drivers (id) on delete cascade,
  kind text not null check (kind in ('medical_card', 'twic')),
  expires_on date not null,
  sent_at timestamptz not null default now(),
  primary key (driver_id, kind, expires_on)
);

comment on table public.driver_expiry_notices is 'One text per card and expiry date, about 30 days before (0041). Service role only.';

alter table public.driver_expiry_notices enable row level security;
revoke all on public.driver_expiry_notices from anon, authenticated;

-- Any reminder text in the last 7 days, the expiry texts included.
create or replace function public.reminded_recently(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select greatest(d.last_doc_reminder_at, d.cdl_state_notice_sent_at, d.twic_date_notice_at,
       (select max(n.sent_at) from public.driver_expiry_notices n where n.driver_id = d.id)) > now() - interval '7 days'
     from public.drivers d where d.id = p_driver_id),
    false);
$$;

-- Stamps and returns the Roster-Ready drivers whose medical card or TWIC expires within 30 days
-- and who have not been told about that date, with texts on and no reminder this week.
create function public.claim_expiry_notices()
returns table (driver_id uuid, phone text, medical_expires_on date, twic_expires_on date)
language sql
volatile
security definer
set search_path = public
as $$
  with due as (
    select d.id, p.phone,
      case when d.medical_card_active is true
             and d.medical_card_expires_on between (now() at time zone 'America/Chicago')::date
                                               and (now() at time zone 'America/Chicago')::date + 30
             and not exists (select 1 from public.driver_expiry_notices n
                             where n.driver_id = d.id and n.kind = 'medical_card' and n.expires_on = d.medical_card_expires_on)
           then d.medical_card_expires_on end as medical,
      case when d.twic_active is true
             and d.twic_expires_on between (now() at time zone 'America/Chicago')::date
                                       and (now() at time zone 'America/Chicago')::date + 30
             and not exists (select 1 from public.driver_expiry_notices n
                             where n.driver_id = d.id and n.kind = 'twic' and n.expires_on = d.twic_expires_on)
           then d.twic_expires_on end as twic
    from public.drivers d
    join public.profiles p on p.id = d.profile_id
    where p.role = 'driver'
      and p.status = 'approved'
      and d.sms_opt_in
      and not d.sms_opted_out
      and not public.reminded_recently(d.id)
    for update of d
  ), picked as (
    select * from due where medical is not null or twic is not null
  ), stamped as (
    insert into public.driver_expiry_notices (driver_id, kind, expires_on)
    select id, 'medical_card', medical from picked where medical is not null
    union all
    select id, 'twic', twic from picked where twic is not null
    returning driver_id
  )
  select id, phone, medical, twic from picked where exists (select 1 from stamped where stamped.driver_id = picked.id);
$$;

revoke execute on function public.claim_expiry_notices() from public, anon, authenticated;
grant execute on function public.claim_expiry_notices() to service_role;
