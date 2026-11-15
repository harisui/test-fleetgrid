-- ---------------------------------------------------------------------------
-- 0040: fewer reminder texts, and one paper per kind (user and Annie, 2026-11-15).
--
-- Drivers replied STOP to reminder texts: two reminders went out in the same second, and the TWIC
-- date text repeated a week later. From here:
-- - reminded_recently(): any reminder text (documents, CDL state, TWIC date) in the last 7 days.
--   Every reminder claim skips such a driver, so a driver gets at most one reminder text a week,
--   whichever job or button sends it. The documents reminder was every 3 days; it is now weekly.
-- - The TWIC date text goes once. The driver page keeps asking for the date (TWIC_DATE_PROMPT).
-- - A new CDL front, CDL back, medical card or TWIC replaces the earlier one of the same kind: the
--   earlier row moves to driver_documents_replaced with its file kept in storage, so the driver,
--   the admin and the carriers see one of each. Account removal deletes those files too.
-- Earlier duplicates are moved the same way, keeping the newest of each kind.
-- ---------------------------------------------------------------------------

-- Reminders ------------------------------------------------------------------

create function public.reminded_recently(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select greatest(d.last_doc_reminder_at, d.cdl_state_notice_sent_at, d.twic_date_notice_at) > now() - interval '7 days'
     from public.drivers d where d.id = p_driver_id),
    false);
$$;

revoke execute on function public.reminded_recently(uuid) from public, anon, authenticated;
grant execute on function public.reminded_recently(uuid) to service_role;

-- One reason each, in this order: opted out, no consent, a reminder text in the last 7 days.
create or replace function public.doc_reminder_candidates(p_driver_id uuid default null)
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
      when public.reminded_recently(d.id) then 'recent'
    end,
    d.last_doc_reminder_at
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where p.role = 'driver'
    and (p.status = 'pending' or (p.status = 'approved' and d.roster_grace_until > now()))
    and (p_driver_id is null or d.id = p_driver_id)
    and cardinality(public.missing_documents(d.id)) > 0;
$$;

create or replace function public.claim_doc_reminder(p_driver_id uuid)
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
    and not public.reminded_recently(d.id)
    and cardinality(public.missing_documents(d.id)) > 0
  returning p.phone, public.missing_documents(d.id);
$$;

create or replace function public.claim_cdl_state_notices()
returns table (driver_id uuid, phone text, missing text[], grace_until timestamptz)
language sql
volatile
security definer
set search_path = public
as $$
  with due as (
    select d.id, p.phone, public.missing_documents(d.id) as missing, d.roster_grace_until
    from public.drivers d
    join public.profiles p on p.id = d.profile_id
    where p.role = 'driver'
      and p.status = 'approved'
      and d.roster_grace_until > now()
      and d.cdl_state is null
      and d.cdl_state_notice_sent_at is null
      and d.sms_opt_in
      and not d.sms_opted_out
      and not public.reminded_recently(d.id)
    for update of d
  ), stamped as (
    update public.drivers d
    set cdl_state_notice_sent_at = now(),
        last_doc_reminder_at = case when cardinality(due.missing) > 0 then now() else d.last_doc_reminder_at end
    from due
    where d.id = due.id
    returning d.id
  )
  select due.id, due.phone, due.missing, due.roster_grace_until from due join stamped on stamped.id = due.id;
$$;

-- The TWIC date text: once per driver.
create or replace function public.claim_twic_date_notices()
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
      and d.twic_date_notice_count = 0
      and not public.reminded_recently(d.id)
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

-- One paper per kind ----------------------------------------------------------

create table public.driver_documents_replaced (
  id uuid primary key,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  type public.document_type not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes int not null,
  uploaded_at timestamptz not null,
  replaced_at timestamptz not null default now(),
  replaced_by uuid
);

comment on table public.driver_documents_replaced is
  'Papers replaced by a newer one of the same kind (0040). The file stays in storage; removed with the account.';

create index driver_documents_replaced_driver on public.driver_documents_replaced (driver_id);

alter table public.driver_documents_replaced enable row level security;

create policy driver_documents_replaced_select_admin on public.driver_documents_replaced
  for select to authenticated
  using ((select public.is_admin()));

revoke all on public.driver_documents_replaced from anon;
revoke insert, update, delete on public.driver_documents_replaced from authenticated;

-- After the new row is in, the earlier ones of its kind move out. Named to fire after
-- driver_documents_rereview, so a Roster-Ready driver's re-review reads "document_uploaded".
create function public.supersede_driver_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  with gone as (
    delete from public.driver_documents x
    where x.driver_id = new.driver_id and x.type = new.type and x.id <> new.id
    returning x.*
  )
  insert into public.driver_documents_replaced (id, driver_id, type, storage_path, file_name, mime_type, size_bytes, uploaded_at, replaced_by)
  select gone.id, gone.driver_id, gone.type, gone.storage_path, gone.file_name, gone.mime_type, gone.size_bytes, gone.created_at, new.id
  from gone;
  return null;
end;
$$;

revoke execute on function public.supersede_driver_document() from public, anon, authenticated;

create trigger driver_documents_supersede
  after insert on public.driver_documents
  for each row
  when (new.type in ('cdl_front', 'cdl_back', 'medical_card', 'twic'))
  execute function public.supersede_driver_document();

-- The duplicates already there: keep the newest of each kind. No re-review for this tidy-up.
alter table public.driver_documents disable trigger driver_documents_rereview;

with ranked as (
  select x.id, row_number() over (partition by x.driver_id, x.type order by x.created_at desc, x.id desc) as rn,
    first_value(x.id) over (partition by x.driver_id, x.type order by x.created_at desc, x.id desc) as newest
  from public.driver_documents x
  where x.type in ('cdl_front', 'cdl_back', 'medical_card', 'twic')
), gone as (
  delete from public.driver_documents x
  using ranked r
  where x.id = r.id and r.rn > 1
  returning x.*, r.newest
)
insert into public.driver_documents_replaced (id, driver_id, type, storage_path, file_name, mime_type, size_bytes, uploaded_at, replaced_by)
select gone.id, gone.driver_id, gone.type, gone.storage_path, gone.file_name, gone.mime_type, gone.size_bytes, gone.created_at, gone.newest
from gone;

alter table public.driver_documents enable trigger driver_documents_rereview;
