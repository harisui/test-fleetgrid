-- ---------------------------------------------------------------------------
-- 0021: the self-reported Clearinghouse and SAP answer (client brief of 2026-10-29).
--
-- A driver may confirm, on an optional sign-up screen or on the profile page, that they
-- have no unresolved violations in the FMCSA Drug & Alcohol Clearinghouse and are not in a
-- SAP return-to-duty process. Only that yes and its time are kept, never any violation or
-- SAP detail. Withdrawing the answer deletes the row; confirming again writes a new time.
--
-- Its own table, not columns on drivers: subscribed carriers may read whole driver rows
-- (drivers_select_subscribed_carrier), and this answer must stay away from carriers until
-- legal review (OPEN_ITEMS 18). Here only the driver and admins can read it.
--
-- Only the table here: the code deployed before this change never reads it, so this part can
-- go to production ahead of the deploy. The new sign-up step is 0022, pushed with the code.
-- ---------------------------------------------------------------------------

create table public.driver_clearinghouse_self_reports (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  confirmed boolean not null default true,
  confirmed_at timestamptz not null default now(),
  -- A row is a yes. "Not answered" is no row, so a no is never stored.
  constraint driver_clearinghouse_self_reports_yes check (confirmed)
);

comment on table public.driver_clearinghouse_self_reports is
  'Self-reported by the driver: no unresolved Clearinghouse violations and not in a SAP process. A yes and its time only. Driver and admins only; carriers never, until legal review.';

-- The time is always the database's, never the client's.
create function public.stamp_clearinghouse_self_report()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.confirmed := true;
  new.confirmed_at := now();
  return new;
end;
$$;

create trigger driver_clearinghouse_self_reports_stamp
  before insert or update on public.driver_clearinghouse_self_reports
  for each row execute function public.stamp_clearinghouse_self_report();

alter table public.driver_clearinghouse_self_reports enable row level security;
revoke all on public.driver_clearinghouse_self_reports from anon, authenticated;
grant select, insert, update, delete on public.driver_clearinghouse_self_reports to authenticated;

create policy driver_clearinghouse_self_reports_own on public.driver_clearinghouse_self_reports
  for all to authenticated
  using (driver_id = (select public.current_driver_id()))
  with check (driver_id = (select public.current_driver_id()));

create policy driver_clearinghouse_self_reports_select_admin on public.driver_clearinghouse_self_reports
  for select to authenticated
  using ((select public.is_admin()));
