-- ---------------------------------------------------------------------------
-- 0035: append-only logs (M3 additions of 2026-11-03, Part D).
--
-- sms_messages, sms_status_events, admin_audit_log, document_views, shift_events and
-- tos_acceptances can be read and added to, never edited or removed: no role but the owner holds
-- INSERT, UPDATE, DELETE or TRUNCATE, every write goes through a SECURITY DEFINER function below,
-- and a trigger raises on any UPDATE or DELETE.
--
-- A text's row is fixed once written. What happens later is a row in sms_status_events, and
-- sms_messages_current shows the latest. The one change allowed on a text is its Twilio SID, once,
-- because a text is logged before it is sent and the SID arrives after.
--
-- The exception: a link column may go to null and nothing else may change. That is what deleting
-- an account does through its foreign keys, and anonymize_driver_logs() does explicitly, so the
-- records stay and stop pointing at a person. Hash-chaining is not part of this.
-- ---------------------------------------------------------------------------

create table public.sms_status_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.sms_messages (id),
  status text,
  error_code text,
  inbound_outcome text,
  shift_id uuid references public.shifts (id) on delete set null,
  -- The clock, not the transaction's start: two events in one transaction keep their order.
  created_at timestamptz not null default clock_timestamp(),
  constraint sms_status_events_inbound_outcome check (
    inbound_outcome is null or inbound_outcome in (
      'booked', 'already_yours', 'filled', 'closed', 'not_eligible', 'no_code', 'keyword', 'unknown_sender', 'overlap'
    )
  )
);

comment on table public.sms_status_events is 'What happened to a text after it was written: delivery status, and what a reply did. Append-only.';

create index sms_status_events_message_idx on public.sms_status_events (message_id, created_at desc);

alter table public.sms_status_events enable row level security;
create policy sms_status_events_select_admin on public.sms_status_events
  for select to authenticated
  using ((select public.is_admin()));

-- A text with its latest status and outcome. Reads go through this.
create view public.sms_messages_current
with (security_invoker = true)
as
select
  m.id, m.direction, m.kind, m.from_phone, m.to_phone, m.body, m.provider_sid,
  coalesce(s.status, m.status) as status,
  case when s.status is not null then s.error_code else m.error_code end as error_code,
  coalesce(c.shift_id, m.shift_id) as shift_id,
  m.driver_id, m.created_at, m.updated_at, m.notice_batch_id, m.resend_of,
  coalesce(c.inbound_outcome, m.inbound_outcome) as inbound_outcome
from public.sms_messages m
left join lateral (
  select e.status, e.error_code from public.sms_status_events e
  where e.message_id = m.id and e.status is not null
  order by e.created_at desc, e.id desc limit 1
) s on true
left join lateral (
  select e.shift_id, e.inbound_outcome from public.sms_status_events e
  where e.message_id = m.id and (e.inbound_outcome is not null or e.shift_id is not null)
  order by e.created_at desc, e.id desc limit 1
) c on true;

grant select on public.sms_messages_current to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The guard. Arguments name the link columns that may go to null.
-- ---------------------------------------------------------------------------
create function public.append_only_guard()
returns trigger
language plpgsql
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_column text;
begin
  if tg_op = 'DELETE' then
    raise exception '% is append-only: rows cannot be deleted', tg_table_name using errcode = '42501';
  end if;
  v_old := to_jsonb(old) - 'updated_at';
  v_new := to_jsonb(new) - 'updated_at';
  foreach v_column in array tg_argv loop
    if v_new ->> v_column is null then
      v_old := v_old - v_column;
      v_new := v_new - v_column;
    end if;
  end loop;
  -- The Twilio SID of a text, once: it arrives after the row is written.
  if tg_table_name = 'sms_messages' and v_old ->> 'provider_sid' is null then
    v_old := v_old - 'provider_sid';
    v_new := v_new - 'provider_sid';
  end if;
  if v_old is distinct from v_new then
    raise exception '% is append-only: rows cannot be changed', tg_table_name using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger sms_messages_append_only
  before update or delete on public.sms_messages
  for each row execute function public.append_only_guard('driver_id', 'shift_id', 'notice_batch_id', 'resend_of');
create trigger sms_status_events_append_only
  before update or delete on public.sms_status_events
  for each row execute function public.append_only_guard('shift_id');
create trigger admin_audit_log_append_only
  before update or delete on public.admin_audit_log
  for each row execute function public.append_only_guard();
alter table public.document_views alter column driver_id drop not null;
create trigger document_views_append_only
  before update or delete on public.document_views
  for each row execute function public.append_only_guard('driver_id');
create trigger shift_events_append_only
  before update or delete on public.shift_events
  for each row execute function public.append_only_guard('shift_id', 'driver_id');

-- Proof of acceptance outlives the account (user decision of 2026-11-05), like the consent log.
drop trigger tos_acceptances_set_updated_at on public.tos_acceptances;
drop policy tos_acceptances_insert_own on public.tos_acceptances;
alter table public.tos_acceptances alter column profile_id drop not null;
alter table public.tos_acceptances drop constraint tos_acceptances_profile_id_fkey;
alter table public.tos_acceptances add constraint tos_acceptances_profile_id_fkey
  foreign key (profile_id) references public.profiles (id) on delete set null;
create trigger tos_acceptances_append_only
  before update or delete on public.tos_acceptances
  for each row execute function public.append_only_guard('profile_id');

drop policy admin_audit_log_insert_admin on public.admin_audit_log;

revoke insert, update, delete, truncate, references, trigger on
  public.sms_messages, public.sms_status_events, public.admin_audit_log,
  public.document_views, public.shift_events, public.tos_acceptances
  from anon, authenticated, service_role;
grant select on public.sms_status_events, public.tos_acceptances to authenticated;
grant select on public.sms_messages, public.sms_status_events, public.admin_audit_log,
  public.document_views, public.shift_events, public.tos_acceptances to service_role;

-- ---------------------------------------------------------------------------
-- The only ways in.
-- ---------------------------------------------------------------------------
-- A text, before it is sent. Null when it is logged already: a webhook retry, or a second resend.
create function public.log_sms_message(
  p_direction public.sms_direction, p_kind text, p_from text, p_to text, p_body text,
  p_provider_sid text default null, p_status text default null, p_error_code text default null,
  p_shift_id uuid default null, p_driver_id uuid default null, p_notice_batch_id uuid default null,
  p_resend_of uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.sms_messages (direction, kind, from_phone, to_phone, body, provider_sid, status, error_code,
    shift_id, driver_id, notice_batch_id, resend_of)
  values (p_direction, p_kind, p_from, p_to, p_body, p_provider_sid, p_status, p_error_code,
    p_shift_id, p_driver_id, p_notice_batch_id, p_resend_of)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  return null;
end;
$$;

-- The provider's answer: the SID once, and the status as an event.
create function public.sms_record_result(p_id uuid, p_provider_sid text, p_status text, p_error_code text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_provider_sid is not null then
    update public.sms_messages set provider_sid = p_provider_sid where id = p_id and provider_sid is null;
  end if;
  insert into public.sms_status_events (message_id, status, error_code) values (p_id, p_status, p_error_code);
end;
$$;

-- A delivery report, by Twilio's id.
create function public.sms_record_status(p_provider_sid text, p_status text, p_error_code text default null)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.sms_status_events (message_id, status, error_code)
  select id, p_status, p_error_code from public.sms_messages where provider_sid = p_provider_sid;
$$;

-- What a reply did.
create function public.sms_record_outcome(p_provider_sid text, p_inbound_outcome text default null, p_shift_id uuid default null)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.sms_status_events (message_id, inbound_outcome, shift_id)
  select id, p_inbound_outcome, p_shift_id from public.sms_messages where provider_sid = p_provider_sid;
$$;

-- Takes a held text to send it; false when another run took it first.
create function public.sms_claim_held(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  perform 1 from public.sms_messages where id = p_id for update;
  select status into v_status from public.sms_messages_current where id = p_id;
  if v_status is distinct from 'held' then
    return false;
  end if;
  insert into public.sms_status_events (message_id, status) values (p_id, 'sending');
  return true;
end;
$$;

-- An admin's own entry: the name and number come from who is signed in, never from the caller.
create function public.write_admin_audit(p_action text, p_target_type text, p_target_id uuid, p_detail jsonb default '{}'::jsonb)
returns setof public.admin_audit_log
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  select phone into v_phone from public.profiles where id = (select auth.uid()) and role = 'admin' and status <> 'blocked';
  if v_phone is null then
    raise exception 'Only admins write the audit log' using errcode = '42501';
  end if;
  return query
    insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id, detail)
    values ((select auth.uid()), v_phone, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb))
    returning *;
end;
$$;

-- A signed-in person accepts the Terms. The same version twice keeps the first record.
create function public.record_tos_acceptance(p_version text, p_ip text default null, p_user_agent text default null)
returns setof public.tos_acceptances
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.tos_acceptances (profile_id, version, ip, user_agent)
  values ((select auth.uid()), p_version, p_ip, p_user_agent)
  on conflict (profile_id, version) do nothing;
  return query select * from public.tos_acceptances where profile_id = (select auth.uid()) and version = p_version;
end;
$$;

-- The account-deletion step: the records stay, and stop pointing at the driver. The one
-- documented exception to append-only, used by AccountRepository before the user is removed.
create function public.anonymize_driver_logs(p_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_driver uuid;
begin
  select id into v_driver from public.drivers where profile_id = p_profile_id;
  if v_driver is null then
    return;
  end if;
  update public.sms_messages set driver_id = null where driver_id = v_driver;
  update public.shift_events set driver_id = null where driver_id = v_driver;
  update public.document_views set driver_id = null where driver_id = v_driver;
end;
$$;

-- The cap now reads the latest status.
create or replace function public.drivers_at_alert_cap(p_driver_ids uuid[], p_cap integer)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.driver_id
  from public.sms_messages_current m
  where m.driver_id = any (p_driver_ids)
    and m.direction = 'outbound'
    and m.kind = 'offer'
    and m.created_at > now() - interval '24 hours'
    and coalesce(m.status, '') not in ('failed', 'undelivered', 'held')
  group by m.driver_id
  having count(*) >= p_cap;
$$;

revoke execute on function public.log_sms_message(public.sms_direction, text, text, text, text, text, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.sms_record_result(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.sms_record_status(text, text, text) from public, anon, authenticated;
revoke execute on function public.sms_record_outcome(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.sms_claim_held(uuid) from public, anon, authenticated;
revoke execute on function public.anonymize_driver_logs(uuid) from public, anon, authenticated;
revoke execute on function public.write_admin_audit(text, text, uuid, jsonb) from public, anon;
revoke execute on function public.record_tos_acceptance(text, text, text) from public, anon;
grant execute on function public.log_sms_message(public.sms_direction, text, text, text, text, text, text, text, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.sms_record_result(uuid, text, text, text) to service_role;
grant execute on function public.sms_record_status(text, text, text) to service_role;
grant execute on function public.sms_record_outcome(text, text, uuid) to service_role;
grant execute on function public.sms_claim_held(uuid) to service_role;
grant execute on function public.anonymize_driver_logs(uuid) to service_role;
grant execute on function public.write_admin_audit(text, text, uuid, jsonb) to authenticated;
grant execute on function public.record_tos_acceptance(text, text, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sms_status_events;
  end if;
end;
$$;
