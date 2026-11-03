-- ---------------------------------------------------------------------------
-- 0028: Registered and Shift-Ready (change request CR-5, part 2, Annie 2026-11-03).
--
-- The database keeps the review values pending, approved and blocked; for drivers they read
-- Registered, Shift-Ready and Blocked. A driver becomes Shift-Ready (approved) only when ALL
-- of these hold, and the database refuses the change otherwise:
--   the CDL front, the CDL back and the medical card uploaded;
--   cdl_state 'TX', or an admin's typed override reason;
--   a full name of at least two words, and the card complete.
-- A Shift-Ready driver who uploads or deletes a required document, or moves the CDL state
-- away from Texas without an override, goes back to Registered with "re-review needed", and
-- the audit log records it as a system action.
--
-- Live data: every approved driver who misses any requirement moves to Registered here. The
-- deployed code keeps working (it only reads the status), and nothing else changes for it.
-- ---------------------------------------------------------------------------

alter table public.drivers
  add column shift_ready_override_reason text,
  add column rereview_needed boolean not null default false,
  add constraint drivers_shift_ready_override_reason_length check (
    shift_ready_override_reason is null or char_length(btrim(shift_ready_override_reason)) between 5 and 300
  );

comment on column public.drivers.shift_ready_override_reason is 'Why an admin made a driver without a Texas CDL Shift-Ready (CR-5). Audited.';
comment on column public.drivers.rereview_needed is 'A Shift-Ready driver changed a required document or the CDL state and went back to Registered.';

-- Drivers may not set the override or clear the re-review flag themselves.
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
  if new.reminder_sent_at is distinct from old.reminder_sent_at
     or new.approval_text_due_at is distinct from old.approval_text_due_at
     or new.approval_text_sent_at is distinct from old.approval_text_sent_at then
    raise exception 'Changing the text stamps is not allowed' using errcode = '42501';
  end if;
  if new.shift_ready_override_reason is distinct from old.shift_ready_override_reason
     or new.rereview_needed is distinct from old.rereview_needed then
    raise exception 'Changing the Shift-Ready review is not allowed' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- What keeps a driver from Shift-Ready, in a fixed order; empty when nothing does.
-- cdl_front, cdl_back, medical_card, cdl_state, last_name, profile.
create function public.shift_ready_missing(p_driver_id uuid)
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
    case when d.cdl_state is distinct from 'TX' and d.shift_ready_override_reason is null then 'cdl_state' end,
    case when coalesce(array_length(regexp_split_to_array(btrim(d.full_name), '\s+'), 1), 0) < 2 then 'last_name' end,
    case when not d.card_completed then 'profile' end
  ], null)
  from public.drivers d
  where d.id = p_driver_id;
$$;

revoke execute on function public.shift_ready_missing(uuid) from public, anon, authenticated;
grant execute on function public.shift_ready_missing(uuid) to service_role;

-- True when a driver may be listed and texted: Shift-Ready in the database's own terms.
create function public.is_shift_ready(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.drivers d
    join public.profiles p on p.id = d.profile_id
    where d.id = p_driver_id and p.status = 'approved'
  ) and cardinality(coalesce(public.shift_ready_missing(p_driver_id), array['none'])) = 0;
$$;

revoke execute on function public.is_shift_ready(uuid) from public, anon;
grant execute on function public.is_shift_ready(uuid) to authenticated, service_role;

-- The gate: a driver's profile becomes approved only when nothing is missing. Everyone,
-- admins and the service role included.
create function public.check_driver_shift_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver uuid;
  v_missing text[];
begin
  if new.role <> 'driver' or new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;
  select id into v_driver from public.drivers where profile_id = new.id;
  v_missing := case when v_driver is null then array['profile'] else public.shift_ready_missing(v_driver) end;
  if cardinality(v_missing) > 0 then
    raise exception 'Not Shift-Ready: %', array_to_string(v_missing, ', ') using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Named to fire after profiles_protect_columns, so a driver changing their own status still
-- gets that refusal first.
create trigger profiles_shift_ready_gate
  before update of status on public.profiles
  for each row execute function public.check_driver_shift_ready();

-- Marking Shift-Ready clears the re-review flag.
create function public.clear_driver_rereview()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'driver' and new.status = 'approved' and old.status is distinct from 'approved' then
    update public.drivers set rereview_needed = false where profile_id = new.id and rereview_needed;
  end if;
  return new;
end;
$$;

create trigger profiles_clear_driver_rereview
  after update of status on public.profiles
  for each row execute function public.clear_driver_rereview();

-- The audit log accepts the system as an actor: the nil id and the word "system".
alter table public.admin_audit_log drop constraint admin_audit_log_admin_phone_e164;
alter table public.admin_audit_log add constraint admin_audit_log_admin_phone_e164
  check (admin_phone ~ '^\+[1-9]\d{7,14}$' or (admin_phone = 'system' and admin_id = '00000000-0000-0000-0000-000000000000'));

-- A Shift-Ready driver who loses a requirement goes back to Registered for re-review.
create function public.demote_driver_for_rereview(p_driver_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_name text;
begin
  select d.profile_id, d.full_name into v_profile, v_name
  from public.drivers d join public.profiles p on p.id = d.profile_id
  where d.id = p_driver_id and p.status = 'approved';
  if v_profile is null then
    return;
  end if;
  update public.profiles set status = 'pending' where id = v_profile;
  update public.drivers set rereview_needed = true where id = p_driver_id;
  insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id, detail)
  values ('00000000-0000-0000-0000-000000000000', 'system', 'driver_rereview_needed', 'driver', p_driver_id,
    jsonb_build_object('from', 'approved', 'to', 'pending', 'reason', p_reason, 'name', v_name));
end;
$$;

revoke execute on function public.demote_driver_for_rereview(uuid, text) from public, anon, authenticated;

create function public.rereview_on_document_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.driver_documents;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if v_row.type in ('cdl_front', 'cdl_back', 'medical_card') then
    perform public.demote_driver_for_rereview(v_row.driver_id,
      case when tg_op = 'DELETE' then 'document_deleted' else 'document_uploaded' end || ':' || v_row.type);
  end if;
  return null;
end;
$$;

create trigger driver_documents_rereview
  after insert or delete on public.driver_documents
  for each row execute function public.rereview_on_document_change();

create function public.rereview_on_driver_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cdl_state is distinct from old.cdl_state and new.cdl_state is distinct from 'TX'
     and new.shift_ready_override_reason is null then
    perform public.demote_driver_for_rereview(new.id, 'cdl_state_changed');
  elsif new.full_name is distinct from old.full_name
     and coalesce(array_length(regexp_split_to_array(btrim(new.full_name), '\s+'), 1), 0) < 2 then
    perform public.demote_driver_for_rereview(new.id, 'name_changed');
  end if;
  return null;
end;
$$;

create trigger drivers_rereview
  after update of cdl_state, full_name on public.drivers
  for each row execute function public.rereview_on_driver_change();

-- Live data: approved drivers who miss any requirement are Registered from now on.
update public.profiles p
set status = 'pending'
from public.drivers d
where d.profile_id = p.id
  and p.role = 'driver'
  and p.status = 'approved'
  and cardinality(public.shift_ready_missing(d.id)) > 0;
