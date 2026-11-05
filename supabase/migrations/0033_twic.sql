-- ---------------------------------------------------------------------------
-- 0033: TWIC (M3 additions of 2026-11-03, Part B).
--
-- drivers.twic_active stays the yes or no; twic_expires_on is new. A TWIC counts only with a date
-- that has not passed on the shift's date in Houston: an expired card, or a yes with no date, is
-- treated as no (user decisions of 2026-11-04). shifts.twic_required stays as it is.
-- Release reason twic_gate ("Turned away at gate: TWIC"): not a no-show, no pause; it flags the
-- driver, audited. Two flags within 90 days read "Needs review" in the admin.
-- Document type twic: the same private bucket, and not among what a booking opens to a carrier.
-- claim_twic_date_notices(): one text at a time to drivers who said yes with no date, at most one
-- per 7 days and 2 in all.
-- ---------------------------------------------------------------------------

alter type public.document_type add value if not exists 'twic';
alter type public.recipient_status add value if not exists 'turned_away';

alter table public.drivers
  add column twic_expires_on date,
  add column twic_issue_at timestamptz,
  add column twic_issue_prior_at timestamptz,
  add column twic_date_notice_at timestamptz,
  add column twic_date_notice_count integer not null default 0;

comment on column public.drivers.twic_expires_on is 'Self-reported. A TWIC counts only with a date not yet passed.';
comment on column public.drivers.twic_issue_at is 'The last time a carrier reported the driver turned away at the gate for TWIC.';
comment on column public.drivers.twic_issue_prior_at is 'The report before that: both within 90 days reads Needs review.';

create function public.twic_valid(p_active boolean, p_expires date, p_on date)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_active, false) and p_expires is not null and p_expires >= p_on;
$$;

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
  p_exclude uuid[] default '{}',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
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
    and (d.roster_grace_until > now() or cardinality(public.shift_ready_missing(d.id)) = 0)
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
    and (not coalesce(p_twic, false) or public.twic_valid(d.twic_active, d.twic_expires_on,
      (coalesce(p_starts_at, now()) at time zone 'America/Chicago')::date))
    and (not coalesce(p_medical, false) or d.medical_card_active is true)
    and (not coalesce(p_manual, false) or d.transmission = 'manual_ok')
    and not (d.id = any (coalesce(p_exclude, '{}')))
    and public.is_in_service_area(d.lat::double precision, d.lng::double precision)
    and round(public.miles_between(p_lat, p_lng, d.lat::double precision, d.lng::double precision)::numeric, 1)
      <= d.service_radius_miles
    and (p_starts_at is null or p_ends_at is null or not exists (
      select 1 from public.shifts b
      where b.booked_driver_id = d.id and b.status = 'booked'
        and b.booked_range && tstzrange(p_starts_at - interval '45 minutes', p_ends_at + interval '45 minutes')
    ));
$$;

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
      and (d.roster_grace_until > now() or cardinality(public.shift_ready_missing(d.id)) = 0)
  ) then
    return query select 'not_eligible'::text, v_recipient.shift_id;
    return;
  end if;

  begin
    update public.shifts
    set status = 'booked', booked_driver_id = p_driver_id, booked_at = now()
    where id = v_recipient.shift_id
      and status = 'open'
      and short_code = p_code
      and (starts_at > now() or (released_at is not null and ends_at > now()))
    returning id into v_booked;
  exception when exclusion_violation then
    return query select 'overlap'::text, v_recipient.shift_id;
    return;
  end;

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
  where id = v_recipient.id and status not in ('booked', 'no_show', 'turned_away');

  if v_shift.status = 'booked' or (v_shift.status = 'open' and v_shift.short_code <> p_code) then
    return query select 'filled'::text, v_shift.id;
  else
    return query select 'closed'::text, v_shift.id;
  end if;
end;
$$;

create or replace function public.protect_driver_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_privileged() then
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id or new.id is distinct from old.id then
    raise exception 'Changing the card owner is not allowed' using errcode = '42501';
  end if;
  if new.sms_opted_out is distinct from old.sms_opted_out
     or new.sms_opted_out_at is distinct from old.sms_opted_out_at then
    raise exception 'Changing SMS opt-out state is not allowed' using errcode = '42501';
  end if;
  if new.no_show_count is distinct from old.no_show_count
     or new.shifts_paused is distinct from old.shifts_paused
     or new.shifts_paused_reason is distinct from old.shifts_paused_reason then
    raise exception 'Changing no-shows or the pause is not allowed' using errcode = '42501';
  end if;
  if new.reminder_sent_at is distinct from old.reminder_sent_at
     or new.approval_text_due_at is distinct from old.approval_text_due_at
     or new.approval_text_sent_at is distinct from old.approval_text_sent_at
     or new.last_doc_reminder_at is distinct from old.last_doc_reminder_at
     or new.cdl_state_notice_sent_at is distinct from old.cdl_state_notice_sent_at
     or new.twic_date_notice_at is distinct from old.twic_date_notice_at
     or new.twic_date_notice_count is distinct from old.twic_date_notice_count
     or new.twic_issue_at is distinct from old.twic_issue_at
     or new.twic_issue_prior_at is distinct from old.twic_issue_prior_at then
    raise exception 'Changing the text stamps is not allowed' using errcode = '42501';
  end if;
  if new.shift_ready_override_reason is distinct from old.shift_ready_override_reason
     or new.rereview_needed is distinct from old.rereview_needed
     or new.roster_grace_until is distinct from old.roster_grace_until then
    raise exception 'Changing the Shift-Ready review is not allowed' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop function public.release_shift(uuid, integer);

-- Why it was released: no_show counts toward the pause; twic_gate only flags the driver.
create function public.release_shift(p_shift_id uuid, p_pause_threshold integer default 2, p_reason text default 'no_show')
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver uuid;
  v_paused boolean;
  v_count integer;
  v_no_show boolean := p_reason <> 'twic_gate';
begin
  if p_reason not in ('no_show', 'twic_gate') then
    raise exception 'Unknown release reason' using errcode = '22023';
  end if;

  select booked_driver_id into v_driver
  from public.shifts
  where id = p_shift_id and status = 'booked' and ends_at > now()
  for update;

  if v_driver is null then
    return null;
  end if;

  update public.broadcast_recipients
  set status = (case when v_no_show then 'no_show' else 'turned_away' end)::public.recipient_status
  where shift_id = p_shift_id and driver_id = v_driver and status = 'booked';
  update public.shifts
  set status = 'open', booked_driver_id = null, booked_at = null, released_at = now(),
      short_code = public.new_shift_code(), booked_notice_failed_at = null
  where id = p_shift_id;

  insert into public.shift_events (shift_id, driver_id, kind, no_show, detail)
  values (p_shift_id, v_driver, 'released', v_no_show, jsonb_build_object('reason', p_reason));

  if not v_no_show then
    update public.drivers set twic_issue_prior_at = twic_issue_at, twic_issue_at = now() where id = v_driver;
    insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id, detail)
    values ('00000000-0000-0000-0000-000000000000', 'system', 'driver_twic_flagged', 'driver', v_driver,
      jsonb_build_object('shift_id', p_shift_id));
    return v_driver;
  end if;

  update public.drivers set no_show_count = no_show_count + 1 where id = v_driver;

  select count(*)::integer into v_count
  from public.shift_events e
  where e.driver_id = v_driver and e.no_show and e.created_at > now() - interval '90 days';

  select shifts_paused into v_paused from public.drivers where id = v_driver;
  if v_count >= p_pause_threshold and not v_paused then
    update public.drivers set shifts_paused = true, shifts_paused_reason = 'no_shows' where id = v_driver;
    insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id, detail)
    values ('00000000-0000-0000-0000-000000000000', 'system', 'driver_auto_paused', 'driver', v_driver,
      jsonb_build_object('no_shows_90_days', v_count, 'threshold', p_pause_threshold));
  end if;

  return v_driver;
end;
$$;

-- Stamps and returns the drivers due the text asking for their TWIC date.
create function public.claim_twic_date_notices()
returns table (driver_id uuid, phone text)
language sql
volatile
security definer
set search_path = public
as $$
  with due as (
    select d.id, p.phone
    from public.drivers d
    join public.profiles p on p.id = d.profile_id
    where p.role = 'driver'
      and p.status in ('pending', 'approved')
      and d.twic_active is true
      and d.twic_expires_on is null
      and d.sms_opt_in
      and not d.sms_opted_out
      and d.twic_date_notice_count < 2
      and (d.twic_date_notice_at is null or d.twic_date_notice_at <= now() - interval '7 days')
    for update of d
  ), stamped as (
    update public.drivers d
    set twic_date_notice_at = now(), twic_date_notice_count = d.twic_date_notice_count + 1
    from due
    where d.id = due.id
    returning d.id
  )
  select due.id, due.phone from due join stamped on stamped.id = due.id;
$$;

revoke execute on function public.release_shift(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.claim_twic_date_notices() from public, anon, authenticated;
grant execute on function public.release_shift(uuid, integer, text) to service_role;
grant execute on function public.claim_twic_date_notices() to service_role;
