-- ---------------------------------------------------------------------------
-- 0041: carrier pricing, $99 a month plus $35 per completed fill, after a 7-day trial
-- (client decision of 2026-11-11, Artifacts/pricing-plan.md).
--
-- A booked shift is a completed fill 2 hours after its scheduled end, unless before then the
-- carrier reported a no-show, released it or cancelled it. record_completed_fills() writes one
-- shift_fills row per completed fill, once. The first 3 fills of shifts that STARTED inside the
-- carrier's trial are included; every other fill is billable. Server code then bills each
-- billable fill as a Stripe invoice item and stamps it here. An admin can waive a fill.
--
-- The trial is once per carrier (carriers.trial_used_at) and once per card
-- (trial_card_fingerprints: the card's fingerprint from Stripe only, never card data).
-- billing_acknowledgments records that the carrier read the price disclosure before checkout;
-- like tos_acceptances it outlives the account and is append-only.
--
-- release_shift: a no-show can be reported until 2 hours after the end. Before the end the
-- shift reopens and goes out again, as before; after the end it is recorded and the shift
-- closes as expired, with nothing sent. Once the window has passed, a booked shift stays booked:
-- no status or driver change can undo a completed fill.
-- ---------------------------------------------------------------------------

-- How long after the end a booked shift becomes a completed fill.
create function public.fill_grace()
returns interval
language sql
immutable
as $$ select interval '2 hours' $$;

-- ---------------------------------------------------------------------------
-- The trial
-- ---------------------------------------------------------------------------
alter table public.carriers add column trial_used_at timestamptz;
comment on column public.carriers.trial_used_at is 'When this carrier''s one trial started. Set by server code only.';

alter table public.subscriptions
  add column trial_start timestamptz,
  add column trial_end timestamptz;
comment on column public.subscriptions.trial_start is 'The Stripe trial window, if the subscription had one.';

create or replace function public.protect_carrier_columns()
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
  if new.trial_used_at is distinct from old.trial_used_at then
    raise exception 'Changing the trial is not allowed' using errcode = '42501';
  end if;

  return new;
end;
$$;

create table public.trial_card_fingerprints (
  fingerprint text primary key,
  -- Not a foreign key: the record outlives the carrier, so a new account cannot reuse the card.
  carrier_id uuid not null,
  created_at timestamptz not null default now(),
  constraint trial_card_fingerprints_present check (length(btrim(fingerprint)) > 0)
);

comment on table public.trial_card_fingerprints is 'Stripe card fingerprints that already had a trial. Never card data.';

alter table public.trial_card_fingerprints enable row level security;
revoke all on public.trial_card_fingerprints from anon, authenticated;
grant select, insert on public.trial_card_fingerprints to service_role;

-- ---------------------------------------------------------------------------
-- The price disclosure acknowledgment
-- ---------------------------------------------------------------------------
create table public.billing_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid references public.carriers (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  version text not null,
  with_trial boolean not null,
  accepted_at timestamptz not null default now(),
  ip text,
  user_agent text,
  constraint billing_acknowledgments_version_present check (length(btrim(version)) > 0)
);

comment on table public.billing_acknowledgments is 'A carrier read the price disclosure (this version) before entering a card.';

create index billing_acknowledgments_carrier_idx on public.billing_acknowledgments (carrier_id, accepted_at desc);

create trigger billing_acknowledgments_append_only
  before update or delete on public.billing_acknowledgments
  for each row execute function public.append_only_guard('carrier_id', 'profile_id');

alter table public.billing_acknowledgments enable row level security;
revoke all on public.billing_acknowledgments from anon, authenticated, service_role;
grant select on public.billing_acknowledgments to authenticated, service_role;

create policy billing_acknowledgments_select_own_or_admin on public.billing_acknowledgments
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

-- The signed-in carrier acknowledges the disclosure. Each checkout start writes its own record.
create function public.record_billing_acknowledgment(p_version text, p_with_trial boolean, p_ip text default null, p_user_agent text default null)
returns public.billing_acknowledgments
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_carrier uuid;
  v_row public.billing_acknowledgments;
begin
  select id into v_carrier from public.carriers where profile_id = (select auth.uid());
  if v_carrier is null or (select public.auth_role()) <> 'carrier' then
    raise exception 'Only a carrier acknowledges the price' using errcode = '42501';
  end if;
  insert into public.billing_acknowledgments (carrier_id, profile_id, version, with_trial, ip, user_agent)
  values (v_carrier, (select auth.uid()), p_version, p_with_trial, p_ip, p_user_agent)
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.record_billing_acknowledgment(text, boolean, text, text) from public, anon;
grant execute on function public.record_billing_acknowledgment(text, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Completed fills
-- ---------------------------------------------------------------------------
create type public.fill_charge as enum ('included', 'billable', 'waived');

create table public.shift_fills (
  id uuid primary key default gen_random_uuid(),
  -- The fill is a billing record: it stays when the shift, carrier or driver is removed.
  shift_id uuid unique references public.shifts (id) on delete set null,
  carrier_id uuid references public.carriers (id) on delete set null,
  driver_id uuid references public.drivers (id) on delete set null,
  shift_starts_at timestamptz not null,
  shift_ends_at timestamptz not null,
  completed_at timestamptz not null,
  charge public.fill_charge not null,
  amount_cents integer not null,
  stripe_invoice_item_id text unique,
  billed_at timestamptz,
  waived_at timestamptz,
  waived_by uuid,
  waive_reason text,
  created_at timestamptz not null default now(),
  constraint shift_fills_amount check (amount_cents >= 0),
  constraint shift_fills_included_free check (charge <> 'included' or amount_cents = 0),
  constraint shift_fills_billed_has_item check ((billed_at is null) = (stripe_invoice_item_id is null)),
  constraint shift_fills_waived_has_reason check (
    (charge = 'waived') = (waived_at is not null)
    and (charge <> 'waived' or (waived_by is not null and char_length(btrim(coalesce(waive_reason, ''))) between 3 and 300))
  )
);

comment on table public.shift_fills is 'One row per completed fill: included in the trial, billable at $35, or waived by an admin.';

create index shift_fills_carrier_idx on public.shift_fills (carrier_id, completed_at desc);
create index shift_fills_unbilled_idx on public.shift_fills (carrier_id) where charge = 'billable' and billed_at is null;

-- Only the billing and waive fields move, and only forward: a fill is never undone or re-dated.
create function public.shift_fills_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'shift_fills rows cannot be deleted' using errcode = '42501';
  end if;
  if new.id <> old.id or new.shift_starts_at <> old.shift_starts_at or new.shift_ends_at <> old.shift_ends_at
     or new.completed_at <> old.completed_at or new.created_at <> old.created_at
     or (new.shift_id is not null and new.shift_id is distinct from old.shift_id)
     or (new.carrier_id is not null and new.carrier_id is distinct from old.carrier_id)
     or (new.driver_id is not null and new.driver_id is distinct from old.driver_id) then
    raise exception 'A fill cannot be changed' using errcode = '42501';
  end if;
  if old.stripe_invoice_item_id is not null and new.stripe_invoice_item_id is distinct from old.stripe_invoice_item_id then
    raise exception 'A billed fill keeps its invoice item' using errcode = '42501';
  end if;
  if old.charge = 'waived' and new.charge <> 'waived' then
    raise exception 'A waived fill stays waived' using errcode = '42501';
  end if;
  if old.charge = 'included' and new.charge = 'billable' then
    raise exception 'An included fill stays included' using errcode = '42501';
  end if;
  if new.amount_cents <> old.amount_cents and new.charge <> 'waived' then
    raise exception 'The amount of a fill is fixed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger shift_fills_guard
  before update or delete on public.shift_fills
  for each row execute function public.shift_fills_guard();

alter table public.shift_fills enable row level security;
revoke all on public.shift_fills from anon, authenticated;
grant select on public.shift_fills to authenticated;
grant select, insert, update on public.shift_fills to service_role;

create policy shift_fills_select_own_or_admin on public.shift_fills
  for select to authenticated
  using (carrier_id = (select public.current_carrier_id()) or (select public.is_admin()));

-- Records every completed fill not yet recorded and returns the new rows. Safe to run again.
-- Included: the shift started inside one of the carrier's trial windows, and the carrier has
-- fewer than p_included fills included so far (earliest start first).
create function public.record_completed_fills(p_amount_cents integer, p_included integer default 3)
returns setof public.shift_fills
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_shift record;
  v_included integer;
  v_in_trial boolean;
  v_row public.shift_fills;
begin
  for v_shift in
    select s.id, s.carrier_id, s.booked_driver_id, s.starts_at, s.ends_at
    from public.shifts s
    where s.status = 'booked'
      and s.ends_at + public.fill_grace() <= now()
      and not exists (select 1 from public.shift_fills f where f.shift_id = s.id)
    order by s.carrier_id, s.starts_at, s.id
    for update of s skip locked
  loop
    perform 1 from public.carriers where id = v_shift.carrier_id for update;
    select count(*)::integer into v_included
    from public.shift_fills f where f.carrier_id = v_shift.carrier_id and f.charge = 'included';
    select exists (
      select 1 from public.subscriptions sub
      where sub.carrier_id = v_shift.carrier_id
        and sub.trial_start is not null and sub.trial_end is not null
        and v_shift.starts_at >= sub.trial_start and v_shift.starts_at < sub.trial_end
    ) into v_in_trial;

    insert into public.shift_fills (shift_id, carrier_id, driver_id, shift_starts_at, shift_ends_at, completed_at, charge, amount_cents)
    values (v_shift.id, v_shift.carrier_id, v_shift.booked_driver_id, v_shift.starts_at, v_shift.ends_at,
      v_shift.ends_at + public.fill_grace(),
      case when v_in_trial and v_included < p_included then 'included' else 'billable' end::public.fill_charge,
      case when v_in_trial and v_included < p_included then 0 else p_amount_cents end)
    on conflict (shift_id) do nothing
    returning * into v_row;
    if v_row.id is not null then
      return next v_row;
    end if;
    v_row := null;
  end loop;
end;
$$;

revoke execute on function public.record_completed_fills(integer, integer) from public, anon, authenticated;
grant execute on function public.record_completed_fills(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- No-shows until 2 hours after the end; a completed fill cannot be undone.
-- ---------------------------------------------------------------------------
create or replace function public.release_shift(p_shift_id uuid, p_pause_threshold integer default 2, p_reason text default 'no_show')
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver uuid;
  v_ended boolean;
  v_paused boolean;
  v_count integer;
  v_no_show boolean := p_reason <> 'twic_gate';
begin
  if p_reason not in ('no_show', 'twic_gate') then
    raise exception 'Unknown release reason' using errcode = '22023';
  end if;

  select booked_driver_id, ends_at <= now() into v_driver, v_ended
  from public.shifts
  where id = p_shift_id and status = 'booked' and ends_at + public.fill_grace() > now()
  for update;

  if v_driver is null then
    return null;
  end if;

  update public.broadcast_recipients
  set status = (case when v_no_show then 'no_show' else 'turned_away' end)::public.recipient_status
  where shift_id = p_shift_id and driver_id = v_driver and status = 'booked';

  if v_ended then
    -- Over already: nothing to send. The shift closes unfilled.
    update public.shifts
    set status = 'expired', booked_driver_id = null, booked_at = null, released_at = now(),
        booked_notice_failed_at = null
    where id = p_shift_id;
  else
    update public.shifts
    set status = 'open', booked_driver_id = null, booked_at = null, released_at = now(),
        short_code = public.new_shift_code(), booked_notice_failed_at = null
    where id = p_shift_id;
  end if;

  insert into public.shift_events (shift_id, driver_id, kind, no_show, detail)
  values (p_shift_id, v_driver, 'released', v_no_show, jsonb_build_object('reason', p_reason, 'after_end', v_ended));

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

-- A booked shift past its window is a completed fill: its status and driver are fixed (a driver
-- row removed by account deletion may still clear the driver; the app never edits shift times).
-- And a booked shift that has started cannot be cancelled: a driver who did not come is a
-- no-show report.
create function public.freeze_completed_fill()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'booked'
     and old.ends_at + public.fill_grace() <= now()
     and (new.status is distinct from old.status
          or (new.booked_driver_id is not null and new.booked_driver_id is distinct from old.booked_driver_id)) then
    raise exception 'This shift is a completed fill and cannot change' using errcode = '42501';
  end if;
  if old.status = 'booked' and new.status = 'cancelled' and old.starts_at <= now() then
    raise exception 'A shift that has started cannot be cancelled' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger shifts_freeze_completed_fill
  before update on public.shifts
  for each row execute function public.freeze_completed_fill();
