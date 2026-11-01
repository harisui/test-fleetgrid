-- ---------------------------------------------------------------------------
-- 0026: admin Messaging (Activity, Milestone 3 part 6; Send notice, change request CR-3).
--
-- notice_batches: each notice an admin sent: the category, the whitelisted choices that
--   filled the template, the filled text for the record, the optional area filter, who sent
--   it (user id only; the audit log has the rest), the counts, quiet hours and the status.
-- sms_messages gains: the batch a text belongs to, resend_of (unique: a message is resent at
--   most once, enforced here), and what an incoming reply turned out to be, so the admin can
--   list replies that matched no shift.
-- notice_recipients(): every driver with the reason they would be left out of a bulk notice
--   (opted out, no consent, blocked), optionally inside one service area.
-- Admins read; the service role writes. Drivers and carriers see none of it.
-- ---------------------------------------------------------------------------

create type public.notice_category as enum ('policy_change', 'service_notice', 'service_restored', 'account_security');
create type public.notice_status as enum ('queued', 'sending', 'sent');

create table public.notice_batches (
  id uuid primary key default gen_random_uuid(),
  category public.notice_category not null,
  variables jsonb not null default '{}'::jsonb,
  body text not null,
  area_id uuid references public.service_areas (id) on delete set null,
  -- Not a foreign key: the record outlives the admin's account, like the audit log.
  created_by uuid not null,
  -- A "service restored" batch names the service notice it answers, once.
  restores_batch_id uuid references public.notice_batches (id) on delete set null,
  recipient_count integer not null default 0,
  excluded_opted_out integer not null default 0,
  excluded_no_consent integer not null default 0,
  excluded_blocked integer not null default 0,
  send_after timestamptz,
  status public.notice_status not null default 'queued',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notice_batches_body_start check (body like 'FleetGrid: %'),
  constraint notice_batches_body_length check (char_length(body) <= 320),
  constraint notice_batches_counts check (
    recipient_count >= 0 and excluded_opted_out >= 0 and excluded_no_consent >= 0 and excluded_blocked >= 0
  )
);

comment on table public.notice_batches is 'Each admin notice: category, the choices, the filled text, who sent it and the counts. No free text.';

create unique index notice_batches_restores_once_idx on public.notice_batches (restores_batch_id) where restores_batch_id is not null;
create index notice_batches_category_created_idx on public.notice_batches (category, created_at desc);
create index notice_batches_due_idx on public.notice_batches (status, send_after);

create trigger notice_batches_set_updated_at
  before update on public.notice_batches
  for each row execute function public.set_updated_at();

alter table public.sms_messages
  add column notice_batch_id uuid references public.notice_batches (id) on delete set null,
  add column resend_of uuid unique references public.sms_messages (id) on delete set null,
  add column inbound_outcome text,
  add constraint sms_messages_inbound_outcome check (
    inbound_outcome is null or inbound_outcome in (
      'booked', 'already_yours', 'filled', 'closed', 'not_eligible', 'no_code', 'keyword', 'unknown_sender'
    )
  );

create index sms_messages_notice_batch_idx on public.sms_messages (notice_batch_id);
create index sms_messages_driver_idx on public.sms_messages (driver_id, created_at desc);

alter table public.notice_batches enable row level security;
revoke all on public.notice_batches from anon, authenticated;
grant select on public.notice_batches to authenticated;

create policy notice_batches_select_admin on public.notice_batches
  for select to authenticated
  using ((select public.is_admin()));

-- Every driver and why a bulk notice would leave them out (null: they get it). One reason
-- each, in this order: opted out, no consent, blocked. With an area, only drivers inside it.
create function public.notice_recipients(p_area_id uuid default null)
returns table (driver_id uuid, phone text, exclusion text)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, p.phone,
    case
      when d.sms_opted_out then 'opted_out'
      when not d.sms_opt_in then 'no_consent'
      when p.status = 'blocked' then 'blocked'
    end
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  left join public.service_areas a on a.id = p_area_id
  where p.role = 'driver'
    and (
      p_area_id is null
      or (
        d.lat is not null and d.lng is not null and a.id is not null
        and round(public.miles_between(a.center_lat::double precision, a.center_lng::double precision,
          d.lat::double precision, d.lng::double precision)::numeric, 3) <= a.radius_miles
      )
    );
$$;

revoke execute on function public.notice_recipients(uuid) from public, anon, authenticated;
grant execute on function public.notice_recipients(uuid) to service_role;

alter table public.admin_audit_log drop constraint admin_audit_log_target_type;
alter table public.admin_audit_log add constraint admin_audit_log_target_type
  check (target_type in ('driver', 'carrier', 'qr_link', 'shift', 'service_area', 'notice_batch', 'sms_message'));

-- Activity follows new texts live (RLS keeps the rows admin-only).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sms_messages;
  end if;
end;
$$;
