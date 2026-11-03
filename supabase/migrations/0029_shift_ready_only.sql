-- ---------------------------------------------------------------------------
-- 0029: only Shift-Ready drivers reach carriers (change request CR-5, part 3).
--
-- Carrier search (the RLS policy search_drivers() runs under), matching for broadcasts and
-- the live "N drivers match" count (matching_drivers()), and booking (claim_shift()) all
-- require a driver who is Shift-Ready in full: approved, and nothing missing by
-- shift_ready_missing() (0028). So a Registered or Blocked driver never appears, and neither
-- does an approved row that misses a document (a raw insert could make one; the gate of 0028
-- stops every update). Additive for the deployed code: the same functions and policy, a
-- stricter rule.
-- ---------------------------------------------------------------------------

drop policy drivers_select_subscribed_carrier on public.drivers;

create policy drivers_select_subscribed_carrier on public.drivers
  for select to authenticated
  using (
    (select public.auth_role()) = 'carrier'
    and (select public.carrier_has_active_subscription())
    and card_completed
    and public.is_shift_ready(id)
    and lat is not null
    and lng is not null
    and public.is_in_service_area(lat::double precision, lng::double precision)
  );

create or replace function public.matching_drivers(
  p_lat double precision,
  p_lng double precision,
  p_cdl_class public.cdl_class,
  p_endorsements public.endorsement[] default '{}',
  p_min_years integer default 0,
  p_equipment public.equipment_type[] default '{}',
  p_twic boolean default false,
  p_medical boolean default false,
  p_manual boolean default false,
  p_exclude uuid[] default '{}'
)
returns table (driver_id uuid, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, p.phone
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where p.role = 'driver'
    and p.status = 'approved'
    -- CR-5: Shift-Ready in full, not only approved (the documents and a Texas CDL or override).
    and cardinality(public.shift_ready_missing(d.id)) = 0
    and d.card_completed
    and d.sms_opt_in
    and not d.sms_opted_out
    and not d.shifts_paused
    and d.lat is not null
    and d.lng is not null
    and d.cdl_class <= p_cdl_class
    and d.endorsements @> coalesce(p_endorsements, '{}')
    and coalesce(d.years_experience, 0) >= coalesce(p_min_years, 0)
    and d.equipment_types @> coalesce(p_equipment, '{}')
    and (not coalesce(p_twic, false) or d.twic_active is true)
    and (not coalesce(p_medical, false) or d.medical_card_active is true)
    and (not coalesce(p_manual, false) or d.transmission = 'manual_ok')
    and not (d.id = any (coalesce(p_exclude, '{}')))
    and public.is_in_service_area(d.lat::double precision, d.lng::double precision)
    and round(public.miles_between(p_lat, p_lng, d.lat::double precision, d.lng::double precision)::numeric, 3)
      <= d.service_radius_miles;
$$;


create or replace function public.claim_shift(p_driver_id uuid, p_code text)
returns table (outcome text, shift_id uuid)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_recipient public.broadcast_recipients;
  v_shift public.shifts;
  v_booked uuid;
begin
  select r.* into v_recipient
  from public.broadcast_recipients r
  join public.shifts s on s.id = r.shift_id
  where r.driver_id = p_driver_id and r.code = p_code
  order by (s.status = 'open' and s.short_code = r.code) desc, r.created_at desc
  limit 1;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if not exists (
    select 1 from public.drivers d
    join public.profiles p on p.id = d.profile_id
    where d.id = p_driver_id and p.status = 'approved' and not d.shifts_paused and not d.sms_opted_out
      and cardinality(public.shift_ready_missing(d.id)) = 0
  ) then
    return query select 'not_eligible'::text, v_recipient.shift_id;
    return;
  end if;

  update public.shifts
  set status = 'booked', booked_driver_id = p_driver_id, booked_at = now()
  where id = v_recipient.shift_id
    and status = 'open'
    and short_code = p_code
    and (starts_at > now() or (released_at is not null and ends_at > now()))
  returning id into v_booked;

  if v_booked is not null then
    update public.broadcast_recipients
    set status = 'booked', replied_at = now()
    where id = v_recipient.id;
    return query select 'won'::text, v_booked;
    return;
  end if;

  select * into v_shift from public.shifts where id = v_recipient.shift_id;

  if v_shift.status = 'booked' and v_shift.booked_driver_id = p_driver_id then
    return query select 'already_yours'::text, v_shift.id;
    return;
  end if;

  update public.broadcast_recipients
  set status = 'too_late', replied_at = now()
  where id = v_recipient.id and status not in ('booked', 'no_show');

  if v_shift.status = 'booked' or (v_shift.status = 'open' and v_shift.short_code <> p_code) then
    return query select 'filled'::text, v_shift.id;
  else
    return query select 'closed'::text, v_shift.id;
  end if;
end;
$$;

