-- ---------------------------------------------------------------------------
-- 0023: Broadcast Shift (Milestone 3, T3.1 and T3.7).
--
-- shifts: a carrier's open shift, inside an active service area, with what it asks of a
--   driver, the required on-site contact, and its life: open, booked, cancelled, expired.
--   The four-digit code is unique among open shifts; a released shift gets a fresh one.
-- broadcast_recipients: who was offered a shift, in which round, at which place in the
--   shuffled order, with the code they were sent and what became of the text.
-- sms_messages: every text in and out. Raw phone numbers live here; only admins read it.
-- drivers.no_show_count and drivers.shifts_paused: a release counts a no-show; an admin's
--   pause keeps a driver out of every broadcast.
--
-- Writes after a carrier posts (booking, cancelling, releasing, the texts) go through the
-- service role. claim_shift() books with one conditional update, so of any number of
-- simultaneous replies exactly one wins.
-- ---------------------------------------------------------------------------

create type public.shift_status as enum ('open', 'booked', 'cancelled', 'expired');
create type public.recipient_status as enum (
  'queued', 'sent', 'delivered', 'failed', 'booked', 'too_late', 'no_show'
);
create type public.sms_direction as enum ('inbound', 'outbound');

-- ---------------------------------------------------------------------------
-- drivers: no-shows and the admin's pause
-- ---------------------------------------------------------------------------
alter table public.drivers
  add column no_show_count integer not null default 0,
  add column shifts_paused boolean not null default false,
  add constraint drivers_no_show_count_range check (no_show_count >= 0);

comment on column public.drivers.no_show_count is 'Booked shifts the carrier released because the driver did not show.';
comment on column public.drivers.shifts_paused is 'Set by an admin: the driver gets no shift texts while true.';

-- Drivers may not change their own no-shows or pause.
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
     or new.shifts_paused is distinct from old.shifts_paused then
    raise exception 'Changing no-shows or the pause is not allowed' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- shifts
-- ---------------------------------------------------------------------------
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid not null references public.carriers (id) on delete cascade,
  status public.shift_status not null default 'open',
  short_code char(4) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  zip text not null,
  city text not null,
  state char(2) not null,
  lat numeric(8, 5) not null,
  lng numeric(8, 5) not null,
  cdl_class public.cdl_class not null default 'A',
  endorsements public.endorsement[] not null default '{}',
  min_years integer not null default 0,
  equipment_types public.equipment_type[] not null default '{}',
  twic_required boolean not null default false,
  medical_required boolean not null default false,
  manual_required boolean not null default false,
  pay_text text,
  work_description text not null,
  onsite_contact_name text not null,
  onsite_contact_phone text not null,
  -- Quiet hours: a broadcast posted at night waits until this time (null: send at once).
  send_after timestamptz,
  -- The current broadcast round (0 until the first goes out; a release starts another).
  broadcast_round integer not null default 0,
  broadcast_at timestamptz,
  -- Set when a no-show is released: the shift may then still be booked after its start,
  -- until it ends, so a replacement can come in late.
  released_at timestamptz,
  booked_driver_id uuid references public.drivers (id) on delete set null,
  booked_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_short_code_format check (short_code ~ '^[0-9]{4}$'),
  constraint shifts_times check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours'),
  constraint shifts_zip_format check (zip ~ '^\d{5}$'),
  constraint shifts_state_format check (state ~ '^[A-Z]{2}$'),
  constraint shifts_lat_range check (lat between -90 and 90),
  constraint shifts_lng_range check (lng between -180 and 180),
  constraint shifts_cdl_class_real check (cdl_class <> 'none'),
  constraint shifts_min_years_range check (min_years between 0 and 60),
  constraint shifts_pay_text_length check (pay_text is null or char_length(btrim(pay_text)) between 1 and 80),
  constraint shifts_work_description_length check (char_length(btrim(work_description)) between 10 and 500),
  constraint shifts_onsite_contact_name_length check (char_length(btrim(onsite_contact_name)) between 2 and 100),
  constraint shifts_onsite_contact_phone_e164 check (onsite_contact_phone ~ '^\+1[2-9][0-9]{9}$'),
  constraint shifts_cancel_reason_length check (cancel_reason is null or char_length(cancel_reason) <= 300),
  constraint shifts_booked_has_driver check (status <> 'booked' or (booked_driver_id is not null and booked_at is not null)),
  constraint shifts_cancelled_has_time check (status <> 'cancelled' or cancelled_at is not null),
  constraint shifts_broadcast_round_range check (broadcast_round >= 0)
);

comment on table public.shifts is 'A carrier''s shift, broadcast by text to matching drivers; the first YES with its code books it.';
comment on column public.shifts.short_code is 'The four digits in the shift text. Unique among open shifts; a release gives a fresh one.';
comment on column public.shifts.pay_text is 'Optional pay line, shown on the driver''s My shifts page, never in a text.';

create unique index shifts_open_short_code_idx on public.shifts (short_code) where status = 'open';
create index shifts_carrier_id_idx on public.shifts (carrier_id, starts_at desc);
create index shifts_status_starts_at_idx on public.shifts (status, starts_at);
create index shifts_booked_driver_id_idx on public.shifts (booked_driver_id);

create trigger shifts_set_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();

-- A free four-digit code: not held by any open shift.
create function public.new_shift_code()
returns char(4)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code char(4);
begin
  for i in 1..200 loop
    v_code := lpad((1000 + floor(random() * 9000))::int::text, 4, '0');
    if not exists (select 1 from public.shifts where status = 'open' and short_code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'No free shift code' using errcode = '23505';
end;
$$;

-- On insert: a code when none is given, the start in the future, the place inside an active
-- area. On update: the place stays inside an active area.
create function public.check_shift()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.short_code is null or btrim(new.short_code) = '' then
      new.short_code := public.new_shift_code();
    end if;
    if new.starts_at <= now() then
      raise exception 'A shift must start in the future' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'INSERT' or new.lat is distinct from old.lat or new.lng is distinct from old.lng then
    if not public.is_in_service_area(new.lat::double precision, new.lng::double precision) then
      raise exception 'The shift is outside every active service area' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger shifts_check
  before insert or update on public.shifts
  for each row execute function public.check_shift();

-- ---------------------------------------------------------------------------
-- broadcast_recipients
-- ---------------------------------------------------------------------------
create table public.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  round integer not null,
  position integer not null,
  code char(4) not null,
  status public.recipient_status not null default 'queued',
  message_sid text,
  error_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broadcast_recipients_unique unique (shift_id, round, driver_id),
  constraint broadcast_recipients_round_range check (round >= 1),
  constraint broadcast_recipients_position_range check (position between 1 and 200),
  constraint broadcast_recipients_code_format check (code ~ '^[0-9]{4}$')
);

comment on table public.broadcast_recipients is 'Each driver offered a shift, per round, in the shuffled send order.';

create index broadcast_recipients_driver_idx on public.broadcast_recipients (driver_id, created_at desc);
create index broadcast_recipients_message_sid_idx on public.broadcast_recipients (message_sid);

create trigger broadcast_recipients_set_updated_at
  before update on public.broadcast_recipients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sms_messages
-- ---------------------------------------------------------------------------
create table public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  direction public.sms_direction not null,
  kind text not null,
  from_phone text not null,
  to_phone text not null,
  body text not null,
  provider_sid text unique,
  status text,
  error_code text,
  shift_id uuid references public.shifts (id) on delete set null,
  driver_id uuid references public.drivers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_messages_kind_format check (kind ~ '^[a-z][a-z_]{1,31}$'),
  constraint sms_messages_body_length check (char_length(body) <= 1600)
);

comment on table public.sms_messages is 'Every shift text in and out, with the provider''s id and delivery status. Admins only.';

create index sms_messages_shift_idx on public.sms_messages (shift_id, created_at);
create index sms_messages_created_at_idx on public.sms_messages (created_at desc);

create trigger sms_messages_set_updated_at
  before update on public.sms_messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers for the policies (security definer, so the policies never recurse)
-- ---------------------------------------------------------------------------
create function public.is_shift_carrier(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shifts s
    join public.carriers c on c.id = s.carrier_id
    where s.id = p_shift_id and c.profile_id = auth.uid()
  );
$$;

revoke execute on function public.is_shift_carrier(uuid) from public, anon;
grant execute on function public.is_shift_carrier(uuid) to authenticated, service_role;
-- The insert trigger runs as the posting carrier, so they may draw a code (nothing more).
revoke execute on function public.new_shift_code() from public, anon;
grant execute on function public.new_shift_code() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- | Table                | Carrier                         | Driver            | Admin      | Service role |
-- | shifts               | select own, insert while subbed | select booked own | select all | all          |
-- | broadcast_recipients | select of own shifts            | select own        | select all | all          |
-- | sms_messages         | none                            | none              | select all | all          |
-- ---------------------------------------------------------------------------
alter table public.shifts enable row level security;
alter table public.broadcast_recipients enable row level security;
alter table public.sms_messages enable row level security;

revoke all on public.shifts, public.broadcast_recipients, public.sms_messages from anon, authenticated;
grant select, insert on public.shifts to authenticated;
grant select on public.broadcast_recipients to authenticated;
grant select on public.sms_messages to authenticated;

create policy shifts_select_carrier_own on public.shifts
  for select to authenticated
  using (carrier_id = (select public.current_carrier_id()));

create policy shifts_select_booked_driver on public.shifts
  for select to authenticated
  using (booked_driver_id is not null and booked_driver_id = (select public.current_driver_id()));

create policy shifts_select_admin on public.shifts
  for select to authenticated
  using ((select public.is_admin()));

-- A subscribed carrier posts an open shift for their own company, nothing more.
create policy shifts_insert_carrier on public.shifts
  for insert to authenticated
  with check (
    carrier_id = (select public.current_carrier_id())
    and (select public.carrier_has_active_subscription())
    and public.profile_status((select auth.uid())) <> 'blocked'
    and status = 'open'
    and broadcast_round = 0
    and broadcast_at is null
    and released_at is null
    and booked_driver_id is null
    and booked_at is null
    and cancelled_at is null
  );

create policy broadcast_recipients_select_carrier on public.broadcast_recipients
  for select to authenticated
  using (public.is_shift_carrier(shift_id));

create policy broadcast_recipients_select_driver_own on public.broadcast_recipients
  for select to authenticated
  using (driver_id = (select public.current_driver_id()));

create policy broadcast_recipients_select_admin on public.broadcast_recipients
  for select to authenticated
  using ((select public.is_admin()));

create policy sms_messages_select_admin on public.sms_messages
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- The booked driver's name and phone: only for the carrier of that shift (or an admin), and
-- only while it is booked (client decision of 2026-10-25). Nowhere else does a carrier read
-- a driver's phone.
-- ---------------------------------------------------------------------------
create function public.booked_driver_contact(p_shift_id uuid)
returns table (driver_id uuid, full_name text, phone text)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.full_name, p.phone
  from public.shifts s
  join public.drivers d on d.id = s.booked_driver_id
  join public.profiles p on p.id = d.profile_id
  where s.id = p_shift_id
    and s.status = 'booked'
    and (public.is_shift_carrier(s.id) or public.is_admin());
$$;

revoke execute on function public.booked_driver_contact(uuid) from public, anon;
grant execute on function public.booked_driver_contact(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Matching (T3.4): the drivers a shift may be texted to. Approved, complete, texts on and not
-- opted out, not paused, the class meets the shift's (A covers B), every endorsement and
-- equipment type, the years, the optional TWIC, medical card and manual, inside an active
-- area, and the shift within the driver's own travel distance. Unordered: the app shuffles.
-- Service role only; carriers see a count through the app.
-- ---------------------------------------------------------------------------
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

revoke execute on function public.matching_drivers(
  double precision, double precision, public.cdl_class, public.endorsement[], integer,
  public.equipment_type[], boolean, boolean, boolean, uuid[]
) from public, anon, authenticated;
grant execute on function public.matching_drivers(
  double precision, double precision, public.cdl_class, public.endorsement[], integer,
  public.equipment_type[], boolean, boolean, boolean, uuid[]
) to service_role;

-- ---------------------------------------------------------------------------
-- claim_shift (T3.7): a driver's YES with a code. Exactly one winner however many reply at
-- once: the booking is a single conditional update on an open shift that has not started.
-- Outcomes: won, already_yours, filled (booked by someone else, or an old code), closed
-- (cancelled or expired), not_eligible (paused, opted out, not approved), not_found.
-- ---------------------------------------------------------------------------
create function public.claim_shift(p_driver_id uuid, p_code text)
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

-- ---------------------------------------------------------------------------
-- release_shift: the booked driver did not show. In one step the no-show is counted, their
-- offer is marked, and the shift reopens with a fresh code for the next round. Returns the
-- driver released, or null when the shift was not booked.
-- ---------------------------------------------------------------------------
create function public.release_shift(p_shift_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver uuid;
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
      short_code = public.new_shift_code()
  where id = p_shift_id;

  return v_driver;
end;
$$;

-- Open shifts nobody can book any more become expired: past their start, or for a released
-- shift past its end. Returns how many.
create function public.expire_shifts()
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  with expired as (
    update public.shifts set status = 'expired'
    where status = 'open'
      and ((released_at is null and starts_at <= now()) or ends_at <= now())
    returning 1
  )
  select count(*)::integer from expired;
$$;

revoke execute on function public.claim_shift(uuid, text) from public, anon, authenticated;
revoke execute on function public.release_shift(uuid) from public, anon, authenticated;
revoke execute on function public.expire_shifts() from public, anon, authenticated;
grant execute on function public.claim_shift(uuid, text) to service_role;
grant execute on function public.release_shift(uuid) to service_role;
grant execute on function public.expire_shifts() to service_role;

-- ---------------------------------------------------------------------------
-- The audit log names shifts and service areas too (Milestone 3 admin).
-- ---------------------------------------------------------------------------
alter table public.admin_audit_log drop constraint admin_audit_log_target_type;
alter table public.admin_audit_log add constraint admin_audit_log_target_type
  check (target_type in ('driver', 'carrier', 'qr_link', 'shift', 'service_area'));

-- ---------------------------------------------------------------------------
-- Realtime: the carrier's shift page follows its shift and recipients live (RLS applies).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shifts, public.broadcast_recipients;
  end if;
end;
$$;
