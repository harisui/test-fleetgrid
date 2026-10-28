-- Milestone 3, part 2 (client brief of 2026-10-28): the admin's audit log, and admins may
-- read the service areas so the Drivers page can say who is inside a launch area in one pass.

-- ---------------------------------------------------------------------------
-- admin_audit_log: who did what to which record, and when. Written by the admin who acts
-- (or the service role), readable by admins, never updated or deleted by anyone signed in.
-- admin_id is not a foreign key on purpose: the log outlives the account; the phone is kept
-- beside it so an entry still names a person later.
-- ---------------------------------------------------------------------------
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  admin_phone text not null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_log_action_format check (action ~ '^[a-z][a-z0-9_]{2,63}$'),
  constraint admin_audit_log_target_type check (target_type in ('driver', 'carrier', 'qr_link')),
  constraint admin_audit_log_admin_phone_e164 check (admin_phone ~ '^\+[1-9]\d{7,14}$')
);

create index admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id, created_at desc);
create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select, insert on public.admin_audit_log to authenticated;

create policy admin_audit_log_select_admin on public.admin_audit_log
  for select to authenticated
  using ((select public.is_admin()));

-- An admin writes entries in their own name only.
create policy admin_audit_log_insert_admin on public.admin_audit_log
  for insert to authenticated
  with check ((select public.is_admin()) and admin_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- service_areas: admins may read the areas (the Drivers page computes "in area" for every
-- card with the same haversine as is_in_service_area; Milestone 3 lets admins edit them).
-- ---------------------------------------------------------------------------
grant select on public.service_areas to authenticated;

create policy service_areas_select_admin on public.service_areas
  for select to authenticated
  using ((select public.is_admin()));
