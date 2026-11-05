-- ---------------------------------------------------------------------------
-- 0030: the welcome text and the missing-documents reminder (change request CR-5, part 4).
--
-- welcome_texts: one row per phone number that was ever sent (or queued) the welcome, keyed by
--   an HMAC of the number with a server secret, never the number itself (user decision of
--   2026-11-03). It outlives the account, so signing up again with the same number never
--   sends it twice. driver_id finds the number to text when a queued welcome goes at 7 AM.
-- drivers.last_doc_reminder_at: the missing-documents reminder goes at most once per 3 days;
--   claim_doc_reminder() stamps it and returns what is missing in one statement, so two sends
--   can never both go.
-- doc_reminder_candidates(): Registered drivers missing a required document, each with what is
--   missing and the reason they would be left out (no consent, opted out, reminded recently).
-- notice_batches: a "doc_reminder" category and the count left out as reminded recently.
-- Service role only for every function; nobody signed in reads welcome_texts.
-- ---------------------------------------------------------------------------

alter type public.notice_category add value if not exists 'doc_reminder';

alter table public.notice_batches add column excluded_recent integer not null default 0
  constraint notice_batches_excluded_recent check (excluded_recent >= 0);

alter table public.drivers add column last_doc_reminder_at timestamptz;
comment on column public.drivers.last_doc_reminder_at is 'When the last missing-documents reminder went out (CR-5). One per 3 days.';

-- Drivers may not change the reminder stamp either.
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
     or new.approval_text_sent_at is distinct from old.approval_text_sent_at
     or new.last_doc_reminder_at is distinct from old.last_doc_reminder_at then
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

create table public.welcome_texts (
  phone_hash text primary key,
  driver_id uuid references public.drivers (id) on delete set null,
  due_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint welcome_texts_phone_hash_format check (phone_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.welcome_texts is 'Phone numbers (as an HMAC) that were sent the welcome text once. Outlives accounts.';

alter table public.welcome_texts enable row level security;
revoke all on public.welcome_texts from anon, authenticated;

-- Queues the welcome for a number once ever. True when this call queued it.
create function public.queue_welcome_text(p_phone_hash text, p_driver_id uuid, p_due_at timestamptz)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  insert into public.welcome_texts (phone_hash, driver_id, due_at)
  values (p_phone_hash, p_driver_id, coalesce(p_due_at, now()))
  on conflict (phone_hash) do nothing
  returning phone_hash into v_hash;
  return v_hash is not null;
end;
$$;

-- Stamps and returns the welcomes due now (one driver, or all when null), only for a driver
-- who still consents and has not said STOP. A welcome more than a day past its time never
-- goes: "thanks for signing up" belongs to the sign-up.
create function public.claim_welcome_texts(p_driver_id uuid default null)
returns table (driver_id uuid, phone text, full_name text)
language sql
volatile
security definer
set search_path = public
as $$
  with due as (
    select w.phone_hash, w.driver_id
    from public.welcome_texts w
    join public.drivers d on d.id = w.driver_id
    join public.profiles p on p.id = d.profile_id
    where (p_driver_id is null or w.driver_id = p_driver_id)
      and w.sent_at is null
      and w.due_at <= now()
      and w.due_at > now() - interval '1 day'
      and d.sms_opt_in
      and not d.sms_opted_out
      and p.status <> 'blocked'
    for update of w skip locked
  )
  update public.welcome_texts w
  set sent_at = now()
  from due, public.drivers d, public.profiles p
  where w.phone_hash = due.phone_hash and d.id = due.driver_id and p.id = d.profile_id
  returning d.id, p.phone, d.full_name;
$$;

-- The required documents a driver lacks: cdl_front, cdl_back, medical_card.
create function public.missing_documents(p_driver_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    case when not exists (select 1 from public.driver_documents x where x.driver_id = p_driver_id and x.type = 'cdl_front') then 'cdl_front' end,
    case when not exists (select 1 from public.driver_documents x where x.driver_id = p_driver_id and x.type = 'cdl_back') then 'cdl_back' end,
    case when not exists (select 1 from public.driver_documents x where x.driver_id = p_driver_id and x.type = 'medical_card') then 'medical_card' end
  ], null);
$$;

-- Registered drivers, and drivers inside the grace of 0028, missing a required document, and why a reminder would skip them. One
-- reason each, in this order: opted out, no consent, reminded in the last 3 days.
create function public.doc_reminder_candidates(p_driver_id uuid default null)
returns table (driver_id uuid, phone text, missing text[], exclusion text, last_doc_reminder_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, p.phone, public.missing_documents(d.id),
    case
      when d.sms_opted_out then 'opted_out'
      when not d.sms_opt_in then 'no_consent'
      when d.last_doc_reminder_at > now() - interval '3 days' then 'recent'
    end,
    d.last_doc_reminder_at
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where p.role = 'driver'
    and (p.status = 'pending' or (p.status = 'approved' and d.roster_grace_until > now()))
    and (p_driver_id is null or d.id = p_driver_id)
    and cardinality(public.missing_documents(d.id)) > 0;
$$;

-- Stamps the reminder and returns the number and what is missing, if the driver may get one
-- now (Registered, consenting, not opted out, something missing, none in the last 3 days).
create function public.claim_doc_reminder(p_driver_id uuid)
returns table (phone text, missing text[])
language sql
volatile
security definer
set search_path = public
as $$
  update public.drivers d
  set last_doc_reminder_at = now()
  from public.profiles p
  where d.id = p_driver_id
    and p.id = d.profile_id
    and p.role = 'driver'
    and (p.status = 'pending' or (p.status = 'approved' and d.roster_grace_until > now()))
    and d.sms_opt_in
    and not d.sms_opted_out
    and (d.last_doc_reminder_at is null or d.last_doc_reminder_at <= now() - interval '3 days')
    and cardinality(public.missing_documents(d.id)) > 0
  returning p.phone, public.missing_documents(d.id);
$$;

revoke execute on function public.queue_welcome_text(text, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_welcome_texts(uuid) from public, anon, authenticated;
revoke execute on function public.missing_documents(uuid) from public, anon, authenticated;
revoke execute on function public.doc_reminder_candidates(uuid) from public, anon, authenticated;
revoke execute on function public.claim_doc_reminder(uuid) from public, anon, authenticated;
grant execute on function public.queue_welcome_text(text, uuid, timestamptz) to service_role;
grant execute on function public.claim_welcome_texts(uuid) to service_role;
grant execute on function public.missing_documents(uuid) to service_role;
grant execute on function public.doc_reminder_candidates(uuid) to service_role;
grant execute on function public.claim_doc_reminder(uuid) to service_role;
