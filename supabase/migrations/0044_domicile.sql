-- ---------------------------------------------------------------------------
-- 0044: out-of-state CDLs and the state of domicile (Milestone 6 feature 4; the attorney,
-- Upwork group, 2026-11-14).
--
-- A valid CDL from any state is accepted: a CDL from outside Texas no longer keeps a driver from
-- Roster-Ready on its own. Instead every driver answers the attorney's questions once (state of
-- domicile; is the address on the CDL current; for a Texas domicile with an out-of-state CDL,
-- was Texas domicile established in the last 30 days, and if not, has the CDL transfer been
-- applied for) and confirms the answers, recorded with the statement and the time.
--
-- A Texas domicile with an out-of-state CDL, established more than 30 days ago, with no transfer
-- applied for, is flagged for review ('cdl_transfer_review' in shift_ready_missing): no shift
-- offers and no listing until an admin reviews it and records why (shift_ready_override_reason,
-- the same typed reason as before). The label never says FleetGrid certified anything.
-- Unanswered questions do not stop a Roster-Ready driver's offers; the driver pages ask them.
-- ---------------------------------------------------------------------------

alter table public.drivers
  add column domicile_state text check (domicile_state ~ '^[A-Z]{2}$'),
  add column cdl_address_current boolean,
  add column tx_domicile_within_30_days boolean,
  add column cdl_transfer_applied boolean,
  add column domicile_confirmed_at timestamptz,
  add column domicile_statement text;

comment on column public.drivers.domicile_state is 'Self-reported state of domicile (0044).';
comment on column public.drivers.tx_domicile_within_30_days is 'Asked only with a Texas domicile and an out-of-state CDL (0044).';
comment on column public.drivers.cdl_transfer_applied is 'Asked only when Texas domicile is older than 30 days (0044).';
comment on column public.drivers.domicile_confirmed_at is 'When the driver confirmed the answers are accurate (0044).';

-- The attorney's review flag: a Texas domicile older than 30 days, an out-of-state CDL, and no
-- transfer applied for.
create function public.needs_cdl_transfer_review(
  p_cdl_state text,
  p_domicile_state text,
  p_within_30_days boolean,
  p_transfer_applied boolean
)
returns boolean
language sql
immutable
as $$
  select coalesce(p_domicile_state = 'TX' and p_cdl_state is not null and p_cdl_state <> 'TX'
    and p_within_30_days is false and p_transfer_applied is false, false);
$$;

-- What keeps a driver from Shift-Ready: a CDL state on record (any state), and no open
-- transfer review unless an admin has reviewed it.
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
    case when d.cdl_state is null then 'cdl_state' end,
    case when public.needs_cdl_transfer_review(d.cdl_state, d.domicile_state, d.tx_domicile_within_30_days, d.cdl_transfer_applied)
      and d.shift_ready_override_reason is null then 'cdl_transfer_review' end,
    case when coalesce(array_length(regexp_split_to_array(btrim(d.full_name), '\s+'), 1), 0) < 2 then 'last_name' end,
    case when not d.card_completed then 'profile' end
  ], null)
  from public.drivers d
  where d.id = p_driver_id;
$$;

-- A Roster-Ready driver whose answers now call for the review goes back for it, as a CDL state
-- outside Texas did before.
create or replace function public.rereview_on_driver_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.needs_cdl_transfer_review(new.cdl_state, new.domicile_state, new.tx_domicile_within_30_days, new.cdl_transfer_applied)
     and not public.needs_cdl_transfer_review(old.cdl_state, old.domicile_state, old.tx_domicile_within_30_days, old.cdl_transfer_applied)
     and new.shift_ready_override_reason is null then
    perform public.demote_driver_for_rereview(new.id, 'cdl_transfer_review');
  elsif new.full_name is distinct from old.full_name
     and coalesce(array_length(regexp_split_to_array(btrim(new.full_name), '\s+'), 1), 0) < 2 then
    perform public.demote_driver_for_rereview(new.id, 'name_changed');
  end if;
  return null;
end;
$$;

drop trigger drivers_rereview on public.drivers;
create trigger drivers_rereview
  after update of cdl_state, full_name, domicile_state, tx_domicile_within_30_days, cdl_transfer_applied on public.drivers
  for each row execute function public.rereview_on_driver_change();
