-- ---------------------------------------------------------------------------
-- 0025: two one-time driver texts (change request of 2026-11-01, approved by Annie).
--
-- Profile reminder: a driver with shift-text consent, not opted out, not blocked, not
--   paused, whose card is unfinished and untouched for 24 hours gets one reminder, ever.
--   reminder_sent_at is stamped by claim_profile_reminders() before the text goes, in the
--   same statement that picks the drivers, so two runs can never both send it.
-- Approval text: when an admin approves a driver with consent and not opted out, the text is
--   queued once (approval_text_due_at: now, or 7 AM Houston at night) and sent once
--   (approval_text_sent_at, stamped by claim_approval_texts()). A second approval after a
--   block finds the queue stamp already set and queues nothing.
--
-- Drivers cannot change any of the four columns. Service role only for the functions.
-- ---------------------------------------------------------------------------

alter table public.drivers
  add column reminder_sent_at timestamptz,
  add column approval_text_due_at timestamptz,
  add column approval_text_sent_at timestamptz;

comment on column public.drivers.reminder_sent_at is 'When the one profile reminder text went out. Never sent twice.';
comment on column public.drivers.approval_text_due_at is 'When the one approval text is due (queued for 7 AM at night). Set once.';
comment on column public.drivers.approval_text_sent_at is 'When the approval text went out. Never sent twice.';

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

  return new;
end;
$$;

-- The reminder: stamps and returns the drivers due one, at most p_limit.
create function public.claim_profile_reminders(p_limit integer default 200)
returns table (driver_id uuid, phone text)
language sql
volatile
security definer
set search_path = public
as $$
  with due as (
    select d.id
    from public.drivers d
    join public.profiles p on p.id = d.profile_id
    where p.role = 'driver'
      and p.status <> 'blocked'
      and d.sms_opt_in
      and not d.sms_opted_out
      and not d.shifts_paused
      and not d.card_completed
      and d.reminder_sent_at is null
      and d.updated_at <= now() - interval '24 hours'
    order by d.updated_at
    limit greatest(coalesce(p_limit, 200), 1)
    for update of d skip locked
  )
  update public.drivers d
  set reminder_sent_at = now()
  from due, public.profiles p
  where d.id = due.id and p.id = d.profile_id
  returning d.id, p.phone;
$$;

-- Queues the approval text once. True when this call queued it.
create function public.queue_approval_text(p_driver_id uuid, p_due_at timestamptz)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.drivers
  set approval_text_due_at = coalesce(p_due_at, now())
  where id = p_driver_id
    and approval_text_due_at is null
    and sms_opt_in
    and not sms_opted_out
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- Stamps and returns the approval texts due now (one driver, or all when null). A driver
-- who opted out, was blocked or paused since it was queued is skipped and keeps waiting.
create function public.claim_approval_texts(p_driver_id uuid default null)
returns table (driver_id uuid, phone text)
language sql
volatile
security definer
set search_path = public
as $$
  with due as (
    select d.id
    from public.drivers d
    join public.profiles p on p.id = d.profile_id
    where (p_driver_id is null or d.id = p_driver_id)
      and p.status = 'approved'
      and d.sms_opt_in
      and not d.sms_opted_out
      and not d.shifts_paused
      and d.approval_text_due_at is not null
      and d.approval_text_due_at <= now()
      and d.approval_text_sent_at is null
    for update of d skip locked
  )
  update public.drivers d
  set approval_text_sent_at = now()
  from due, public.profiles p
  where d.id = due.id and p.id = d.profile_id
  returning d.id, p.phone;
$$;

revoke execute on function public.claim_profile_reminders(integer) from public, anon, authenticated;
revoke execute on function public.queue_approval_text(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_approval_texts(uuid) from public, anon, authenticated;
grant execute on function public.claim_profile_reminders(integer) to service_role;
grant execute on function public.queue_approval_text(uuid, timestamptz) to service_role;
grant execute on function public.claim_approval_texts(uuid) to service_role;
