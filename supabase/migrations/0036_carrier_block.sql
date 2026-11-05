-- ---------------------------------------------------------------------------
-- 0036: blocking a carrier ends their access at once (M3 additions of 2026-11-03, Part E).
--
-- Pages, the app's services and shift posting already refused a blocked carrier. Two gaps closed:
-- carrier_has_active_subscription() ignored the block, so a session still valid could read
-- drivers directly; and open shifts stayed open. Blocking now pauses the carrier's open shifts
-- (carrier_paused_at): no alert goes, no YES books them, and a reply is told the shift is closed.
-- Lifting the block lifts the pause. A booked shift is left alone: a driver is counting on it.
-- ---------------------------------------------------------------------------

create or replace function public.carrier_has_active_subscription()
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
    join public.profiles p on p.id = c.profile_id
    where c.profile_id = auth.uid()
      and p.status <> 'blocked'
      and s.status in ('active', 'trialing')
  );
$$;

alter table public.shifts add column carrier_paused_at timestamptz;
comment on column public.shifts.carrier_paused_at is 'The carrier was blocked while this shift was open: no alert goes and nobody can book it.';

create function public.pause_blocked_carrier_shifts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> 'carrier' or new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'blocked' then
    update public.shifts s set carrier_paused_at = now()
    from public.carriers c
    where c.id = s.carrier_id and c.profile_id = new.id and s.status = 'open' and s.carrier_paused_at is null;
  elsif old.status = 'blocked' then
    update public.shifts s set carrier_paused_at = null
    from public.carriers c
    where c.id = s.carrier_id and c.profile_id = new.id and s.carrier_paused_at is not null;
  end if;
  return new;
end;
$$;

create trigger profiles_pause_blocked_carrier_shifts
  after update of status on public.profiles
  for each row execute function public.pause_blocked_carrier_shifts();

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
      and carrier_paused_at is null
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

create or replace function public.stale_queued_recipients(p_before timestamptz)
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
    and s.carrier_paused_at is null
    and s.short_code = r.code
    and s.starts_at > now()
    and d.sms_opt_in and not d.sms_opted_out and not d.shifts_paused
  order by r.created_at, r.position
  limit 500;
$$;
