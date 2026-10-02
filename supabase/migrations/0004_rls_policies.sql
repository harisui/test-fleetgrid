-- 0004: Row Level Security (Milestone 1)
--
-- | Table            | Driver                          | Carrier           | Admin      |
-- | profiles         | select/update own (not role,    | select/update own | all        |
-- |                  | not status)                     |                   |            |
-- | drivers          | select/insert/update own        | Milestone 2       | all        |
-- | driver_documents | select/insert/delete own        | none              | all        |
-- | tos_acceptances  | insert/select own               | insert/select own | select all |
--
-- Anonymous visitors get nothing: no table privileges and no policies.
-- Column protection (role, status, phone, opt-out) is enforced by the triggers in 0003.

alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_documents enable row level security;
alter table public.tos_acceptances enable row level security;

revoke all on public.profiles, public.drivers, public.driver_documents, public.tos_acceptances
  from anon;
revoke truncate, references, trigger
  on public.profiles, public.drivers, public.driver_documents, public.tos_acceptances
  from authenticated;

-- Tables created by later migrations must opt in explicitly.
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

-- A user creates only their own profile, as driver or carrier, always pending,
-- with the phone number they verified. The primary key allows it only once.
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (
    id = (select auth.uid())
    and role in ('driver', 'carrier')
    and status = 'pending'
    and phone = '+' || ((select auth.jwt()) ->> 'phone')
  );

create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check ((select public.is_admin()));

create policy profiles_update_own_or_admin on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- drivers
-- ---------------------------------------------------------------------------
create policy drivers_select_own_or_admin on public.drivers
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

-- Only a driver can create a card, only for themselves, and never pre-completed
-- opt-out state.
create policy drivers_insert_own on public.drivers
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (select public.auth_role()) = 'driver'
    and sms_opted_out = false
    and sms_opted_out_at is null
  );

create policy drivers_insert_admin on public.drivers
  for insert to authenticated
  with check ((select public.is_admin()));

create policy drivers_update_own_or_admin on public.drivers
  for update to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()))
  with check (profile_id = (select auth.uid()) or (select public.is_admin()));

create policy drivers_delete_admin on public.drivers
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- driver_documents
-- ---------------------------------------------------------------------------
create policy driver_documents_select_own_or_admin on public.driver_documents
  for select to authenticated
  using (driver_id = (select public.current_driver_id()) or (select public.is_admin()));

-- The file must live in the driver's own storage folder: {driver_id}/{file}.
create policy driver_documents_insert_own on public.driver_documents
  for insert to authenticated
  with check (
    driver_id = (select public.current_driver_id())
    and storage_path like driver_id::text || '/%'
  );

create policy driver_documents_insert_admin on public.driver_documents
  for insert to authenticated
  with check ((select public.is_admin()));

create policy driver_documents_update_admin on public.driver_documents
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy driver_documents_delete_own_or_admin on public.driver_documents
  for delete to authenticated
  using (driver_id = (select public.current_driver_id()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- tos_acceptances: an append-only audit trail
-- ---------------------------------------------------------------------------
create policy tos_acceptances_select_own_or_admin on public.tos_acceptances
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

create policy tos_acceptances_insert_own on public.tos_acceptances
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

revoke update, delete on public.tos_acceptances from authenticated;
