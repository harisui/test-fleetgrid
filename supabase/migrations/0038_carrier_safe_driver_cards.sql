-- ---------------------------------------------------------------------------
-- 0038: carriers read only the columns their pages need (user decision of 2026-11-05).
--
-- Row Level Security decides rows, not columns, so the policy that let a subscribed carrier read
-- listed drivers also let that session read no_show_count, twic_issue_at, shifts_paused and every
-- other column. The policy goes. A carrier's direct read of public.drivers now returns nothing.
--
-- carrier_driver_cards() is the one way to a driver's card: a fixed list of columns, under the
-- same rule the policy had. Reliability data, pause reasons, release history, consent text,
-- review notes and the sign-up source are not in the list. Being paused or having no-shows does
-- not change who is listed, so neither can be worked out from the search.
--
-- search_drivers() ran with the caller's rights and leaned on that policy, so it now checks the
-- same rule itself. It still answers only ids and distances.
-- ---------------------------------------------------------------------------

drop policy drivers_select_subscribed_carrier on public.drivers;

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
    d.medical_card_active, d.clearinghouse_registered, d.mvr_status, d.sms_opt_in, d.sms_opted_out,
    d.roster_grace_until
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

create or replace function public.search_drivers(

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
security definer
set search_path = public
as $$
  with matches as (
    select d.id,
           round(public.miles_between(p_lat, p_lng, d.lat::double precision, d.lng::double precision)::numeric, 1)
             as distance_miles
    from public.drivers d
    where (select public.auth_role()) = 'carrier'::public.user_role
      and (select public.carrier_has_active_subscription())
      and d.card_completed
      and public.is_shift_ready(d.id)
      and d.lat is not null
      and d.lng is not null
      and public.is_in_service_area(d.lat::double precision, d.lng::double precision)
      and round(public.miles_between(p_lat, p_lng, d.lat::double precision, d.lng::double precision)::numeric, 3)
        <= p_radius_miles
      and (p_cdl_class is null or d.cdl_class <= p_cdl_class)
      and d.endorsements @> coalesce(p_endorsements, '{}')
      and (p_min_years is null or d.years_experience >= p_min_years)
      and (p_twic is null or public.twic_valid(d.twic_active, d.twic_expires_on, (now() at time zone 'America/Chicago')::date) = p_twic)
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

revoke execute on function public.search_drivers(double precision, double precision, integer, public.cdl_class, public.endorsement[], integer, boolean, boolean, boolean, public.equipment_type[], public.mvr_status, integer, integer) from public, anon;
grant execute on function public.search_drivers(double precision, double precision, integer, public.cdl_class, public.endorsement[], integer, boolean, boolean, boolean, public.equipment_type[], public.mvr_status, integer, integer) to authenticated;
