-- ---------------------------------------------------------------------------
-- 0032: booking safeguards (M3 additions of 2026-11-03, Part A).
--
-- Overlaps: a driver holds no two bookings less than 90 minutes apart. shifts.booked_range pads
--   a shift 45 minutes each side, and an exclusion constraint enforces it, so claim_shift()
--   cannot race (user decision of 2026-11-04). Matching skips such a driver too.
-- No-shows: shift_events records dated events; release_shift() counts the last 90 days and
--   pauses the driver at the threshold the caller passes, audited as the system.
-- Alert cap: drivers_at_alert_cap() counts shift alerts in a rolling 24 hours.
-- Lost replies: sms_inbound_processing marks a reply finished only when its handling finished,
--   so a retry of an unfinished one is handled again, not dropped.
-- Cut-off broadcasts: claim_recipient_send() and stale_queued_recipients() let a job send what
--   a broadcast left queued, at most once per driver and shift.
-- Booked, not notified: shifts.booked_notice_failed_at.
-- ---------------------------------------------------------------------------

create extension if not exists btree_gist with schema extensions;

alter type public.recipient_status add value if not exists 'skipped_cap';

alter table public.sms_messages drop constraint sms_messages_inbound_outcome;
alter table public.sms_messages add constraint sms_messages_inbound_outcome check (
  inbound_outcome is null or inbound_outcome in (
    'booked', 'already_yours', 'filled', 'closed', 'not_eligible', 'no_code', 'keyword', 'unknown_sender', 'overlap'
  )
);

-- ---------------------------------------------------------------------------
-- Overlaps
-- ---------------------------------------------------------------------------
alter table public.shifts
  add column booked_range tstzrange,
  add column booked_notice_failed_at timestamptz;

comment on column public.shifts.booked_range is 'The shift padded 45 minutes each side: two bookings of a driver need 90 minutes between them.';
comment on column public.shifts.booked_notice_failed_at is 'The booked text could not be delivered: the admin should call the driver.';

create function public.set_shift_booked_range()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.booked_range := tstzrange(new.starts_at - interval '45 minutes', new.ends_at + interval '45 minutes');
  return new;
end;
$$;

create trigger shifts_set_booked_range
  before insert or update of starts_at, ends_at on public.shifts
  for each row execute function public.set_shift_booked_range();

update public.shifts set booked_range = tstzrange(starts_at - interval '45 minutes', ends_at + interval '45 minutes');

alter table public.shifts add constraint shifts_no_overlapping_bookings
  exclude using gist (booked_driver_id with =, booked_range with &&)
  where (status = 'booked' and booked_driver_id is not null);

-- ---------------------------------------------------------------------------
-- Dated events. Part D makes the table append-only.
-- ---------------------------------------------------------------------------
create table public.shift_events (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.shifts (id) on delete set null,
  driver_id uuid references public.drivers (id) on delete set null,
  kind text not null,
  no_show boolean not null default false,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint shift_events_kind check (kind in ('booked', 'check_in', 'started', 'ended', 'released', 'cancelled'))
);

comment on table public.shift_events is 'What happened to each shift and when. Check-in and started are ready for later; they do not fire yet.';

create index shift_events_no_show_idx on public.shift_events (driver_id, created_at desc) where no_show;
create index shift_events_shift_idx on public.shift_events (shift_id, kind);

alter table public.shift_events enable row level security;
revoke all on public.shift_events from anon, authenticated;
grant select on public.shift_events to authenticated;

create policy shift_events_select_admin on public.shift_events
  for select to authenticated
  using ((select public.auth_role()) = 'admin');

create function public.log_shift_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'booked' and old.status is distinct from 'booked' then
    insert into public.shift_events (shift_id, driver_id, kind) values (new.id, new.booked_driver_id, 'booked');
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.shift_events (shift_id, driver_id, kind) values (new.id, old.booked_driver_id, 'cancelled');
  end if;
  return new;
end;
$$;

create trigger shifts_log_status_event
  after update of status on public.shifts
  for each row execute function public.log_shift_status_event();

-- Marks booked shifts whose end has passed, once. The daily job calls it.
create function public.record_ended_shifts()
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  with ended as (
    insert into public.shift_events (shift_id, driver_id, kind)
    select s.id, s.booked_driver_id, 'ended'
    from public.shifts s
    where s.status = 'booked' and s.ends_at < now()
      and not exists (select 1 from public.shift_events e where e.shift_id = s.id and e.kind = 'ended')
    returning 1
  )
  select count(*)::integer from ended;
$$;

-- Existing no-shows become dated events: the release date where it is known, otherwise now.
insert into public.shift_events (shift_id, driver_id, kind, no_show, created_at, detail)
select r.shift_id, r.driver_id, 'released', true, coalesce(s.released_at, now()), '{"backfilled": true}'::jsonb
from public.broadcast_recipients r
join public.shifts s on s.id = r.shift_id
where r.status = 'no_show';

insert into public.shift_events (driver_id, kind, no_show, detail)
select d.id, 'released', true, '{"backfilled": true, "date": "migration"}'::jsonb
from public.drivers d
cross join lateral generate_series(
  1,
  d.no_show_count - (select count(*) from public.shift_events e where e.driver_id = d.id and e.no_show)::integer
) as n
where d.no_show_count > 0;

alter table public.drivers add column shifts_paused_reason text;
comment on column public.drivers.shifts_paused_reason is 'Why shift texts are paused: no_shows when the system did it. Null otherwise.';

-- ---------------------------------------------------------------------------
-- Booking and release
-- ---------------------------------------------------------------------------
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
  where id = v_recipient.id and status not in ('booked', 'no_show');

  if v_shift.status = 'booked' or (v_shift.status = 'open' and v_shift.short_code <> p_code) then
    return query select 'filled'::text, v_shift.id;
  else
    return query select 'closed'::text, v_shift.id;
  end if;
end;
$$;

drop function public.release_shift(uuid);

-- The threshold comes from the app's one constant, NO_SHOW_PAUSE_THRESHOLD.
create function public.release_shift(p_shift_id uuid, p_pause_threshold integer default 2)
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
begin
  select booked_driver_id into v_driver
  from public.shifts
  where id = p_shift_id and status = 'booked' and ends_at > now()
  for update;

  if v_driver is null then
    return null;
  end if;

  update public.drivers set no_show_count = no_show_count + 1 where id = v_driver;
  update public.broadcast_recipients set status = 'no_show'
  where shift_id = p_shift_id and driver_id = v_driver and status = 'booked';
  update public.shifts
  set status = 'open', booked_driver_id = null, booked_at = null, released_at = now(),
      short_code = public.new_shift_code(), booked_notice_failed_at = null
  where id = p_shift_id;

  insert into public.shift_events (shift_id, driver_id, kind, no_show)
  values (p_shift_id, v_driver, 'released', true);

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

-- ---------------------------------------------------------------------------
-- Matching: optional shift times, so an overlapping driver gets no alert.
-- ---------------------------------------------------------------------------
drop function public.matching_drivers(double precision, double precision, public.cdl_class, public.endorsement[], integer, public.equipment_type[], boolean, boolean, boolean, uuid[]);

create function public.matching_drivers(
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
    and (not coalesce(p_twic, false) or d.twic_active is true)
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

-- ---------------------------------------------------------------------------
-- Alert cap
-- ---------------------------------------------------------------------------
create function public.drivers_at_alert_cap(p_driver_ids uuid[], p_cap integer)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.driver_id
  from public.sms_messages m
  where m.driver_id = any (p_driver_ids)
    and m.direction = 'outbound'
    and m.kind = 'offer'
    and m.created_at > now() - interval '24 hours'
    and coalesce(m.status, '') not in ('failed', 'undelivered', 'held')
  group by m.driver_id
  having count(*) >= p_cap;
$$;

-- ---------------------------------------------------------------------------
-- Lost replies. Part D keeps sms_messages fixed, so this is its own table.
-- ---------------------------------------------------------------------------
create table public.sms_inbound_processing (
  provider_sid text primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table public.sms_inbound_processing is 'A reply is done only when finished_at is set. A retry after 60 seconds handles an unfinished one again.';

alter table public.sms_inbound_processing enable row level security;
revoke all on public.sms_inbound_processing from anon, authenticated;

-- True when this call should handle the reply: new, or left unfinished for 60 seconds.
create function public.begin_inbound(p_sid text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sid text;
begin
  insert into public.sms_inbound_processing (provider_sid) values (p_sid)
  on conflict (provider_sid) do update set started_at = now()
    where sms_inbound_processing.finished_at is null
      and sms_inbound_processing.started_at < now() - interval '60 seconds'
  returning provider_sid into v_sid;
  return v_sid is not null;
end;
$$;

create function public.finish_inbound(p_sid text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.sms_inbound_processing set finished_at = now() where provider_sid = p_sid;
$$;

-- Replies left unfinished, for the job to handle again.
create function public.unfinished_inbound(p_before timestamptz)
returns table (provider_sid text, from_phone text, to_phone text, body text)
language sql
stable
security definer
set search_path = public
as $$
  select m.provider_sid, m.from_phone, m.to_phone, m.body
  from public.sms_inbound_processing i
  join public.sms_messages m on m.provider_sid = i.provider_sid and m.direction = 'inbound'
  where i.finished_at is null and i.started_at < p_before
  order by i.started_at
  limit 200;
$$;

-- ---------------------------------------------------------------------------
-- Cut-off broadcasts
-- ---------------------------------------------------------------------------
alter table public.broadcast_recipients add column send_claimed_at timestamptz;

-- True when this call should send the alert. Once a text is on record for this driver and
-- shift it is treated as sent: a driver may miss an alert, but never gets it twice.
create function public.claim_recipient_send(p_recipient_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.broadcast_recipients r
  set send_claimed_at = now()
  where r.id = p_recipient_id
    and r.status = 'queued'
    and (r.send_claimed_at is null or r.send_claimed_at < now() - interval '2 minutes')
    and not exists (
      select 1 from public.sms_messages m
      where m.driver_id = r.driver_id and m.shift_id = r.shift_id and m.kind = 'offer'
        and m.created_at >= r.created_at
    )
  returning r.id into v_id;
  return v_id is not null;
end;
$$;

-- What a broadcast left queued, for drivers who may still get it.
create function public.stale_queued_recipients(p_before timestamptz)
returns table (recipient_id uuid, shift_id uuid, driver_id uuid, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.shift_id, r.driver_id, p.phone
  from public.broadcast_recipients r
  join public.shifts s on s.id = r.shift_id
  join public.drivers d on d.id = r.driver_id
  join public.profiles p on p.id = d.profile_id
  where r.status = 'queued'
    and r.created_at < p_before
    and s.status = 'open'
    and s.short_code = r.code
    and s.starts_at > now()
    and d.sms_opt_in and not d.sms_opted_out and not d.shifts_paused
  order by r.created_at, r.position
  limit 500;
$$;

-- Drivers may not change the reason either.
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
     or new.cdl_state_notice_sent_at is distinct from old.cdl_state_notice_sent_at then
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

revoke execute on function public.release_shift(uuid, integer) from public, anon, authenticated;
revoke execute on function public.matching_drivers(double precision, double precision, public.cdl_class, public.endorsement[], integer, public.equipment_type[], boolean, boolean, boolean, uuid[], timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.record_ended_shifts() from public, anon, authenticated;
revoke execute on function public.drivers_at_alert_cap(uuid[], integer) from public, anon, authenticated;
revoke execute on function public.begin_inbound(text) from public, anon, authenticated;
revoke execute on function public.finish_inbound(text) from public, anon, authenticated;
revoke execute on function public.unfinished_inbound(timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_recipient_send(uuid) from public, anon, authenticated;
revoke execute on function public.stale_queued_recipients(timestamptz) from public, anon, authenticated;
grant execute on function public.release_shift(uuid, integer) to service_role;
grant execute on function public.matching_drivers(double precision, double precision, public.cdl_class, public.endorsement[], integer, public.equipment_type[], boolean, boolean, boolean, uuid[], timestamptz, timestamptz) to service_role;
grant execute on function public.record_ended_shifts() to service_role;
grant execute on function public.drivers_at_alert_cap(uuid[], integer) to service_role;
grant execute on function public.begin_inbound(text) to service_role;
grant execute on function public.finish_inbound(text) to service_role;
grant execute on function public.unfinished_inbound(timestamptz) to service_role;
grant execute on function public.claim_recipient_send(uuid) to service_role;
grant execute on function public.stale_queued_recipients(timestamptz) to service_role;
