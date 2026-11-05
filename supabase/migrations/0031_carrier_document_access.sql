-- ---------------------------------------------------------------------------
-- 0031: carriers see a driver's documents only for a booked shift (security fix, user decision
-- of 2026-11-04).
--
-- Until now 0015 let any subscribed carrier read the documents and files of any listed driver.
-- From here a carrier can open only the CDL front, the CDL back and the medical card, only of a
-- driver booked on one of its own shifts, from the booking until 7 days after the shift ends. A
-- released or cancelled booking ends it at once: a release clears booked_driver_id and a
-- cancellation changes the status. Never from search or browsing.
--
-- document_views: one row for every carrier view, written by record_carrier_document_view()
-- before the link is made. It outlives the document and the accounts. Admins read it. Part D of
-- the same batch makes it append-only and logs admin views.
-- ---------------------------------------------------------------------------

drop policy driver_documents_select_subscribed_carrier on public.driver_documents;
drop policy driver_documents_objects_select_subscribed_carrier on storage.objects;

-- The carrier's shift that lets it see this driver's document of this type now, or null.
create function public.carrier_document_shift(p_driver_id uuid, p_type public.document_type)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.shifts s
  join public.carriers c on c.id = s.carrier_id
  where c.profile_id = (select auth.uid())
    and (select public.auth_role()) = 'carrier'
    and (select public.carrier_has_active_subscription())
    and p_type in ('cdl_front', 'cdl_back', 'medical_card')
    and s.booked_driver_id = p_driver_id
    and s.status = 'booked'
    and now() < s.ends_at + interval '7 days'
  order by s.ends_at desc
  limit 1;
$$;

revoke execute on function public.carrier_document_shift(uuid, public.document_type) from public, anon;
grant execute on function public.carrier_document_shift(uuid, public.document_type) to authenticated;

create policy driver_documents_select_booking_carrier on public.driver_documents
  for select to authenticated
  using (public.carrier_document_shift(driver_id, type) is not null);

-- The same rule for the file: only a path that belongs to a document the carrier may see.
create function public.carrier_may_read_document_object(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.driver_documents x
    where x.storage_path = p_path and public.carrier_document_shift(x.driver_id, x.type) is not null
  );
$$;

revoke execute on function public.carrier_may_read_document_object(text) from public, anon;
grant execute on function public.carrier_may_read_document_object(text) to authenticated;

create policy driver_documents_objects_select_booking_carrier on storage.objects
  for select to authenticated
  using (bucket_id = 'driver-documents' and public.carrier_may_read_document_object(name));

create table public.document_views (
  id uuid primary key default gen_random_uuid(),
  -- Not foreign keys: the record outlives the people and the file, like the audit log.
  viewer_id uuid not null,
  viewer_role text not null,
  driver_id uuid not null,
  document_id uuid not null,
  document_type public.document_type not null,
  shift_id uuid,
  viewed_at timestamptz not null default now(),
  constraint document_views_viewer_role check (viewer_role in ('carrier', 'admin'))
);

comment on table public.document_views is 'Every view of a driver document: who, which driver, which document, which shift, when.';

create index document_views_driver_viewed_idx on public.document_views (driver_id, viewed_at desc);

alter table public.document_views enable row level security;
revoke all on public.document_views from anon, authenticated;
grant select on public.document_views to authenticated;

create policy document_views_select_admin on public.document_views
  for select to authenticated
  using ((select public.auth_role()) = 'admin');

-- Records the view if the carrier may see the document. False writes nothing and shows nothing.
create function public.record_carrier_document_view(p_document_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_document public.driver_documents;
  v_shift uuid;
begin
  select * into v_document from public.driver_documents where id = p_document_id;
  if not found then
    return false;
  end if;
  v_shift := public.carrier_document_shift(v_document.driver_id, v_document.type);
  if v_shift is null then
    return false;
  end if;
  insert into public.document_views (viewer_id, viewer_role, driver_id, document_id, document_type, shift_id)
  values ((select auth.uid()), 'carrier', v_document.driver_id, v_document.id, v_document.type, v_shift);
  return true;
end;
$$;

revoke execute on function public.record_carrier_document_view(uuid) from public, anon;
grant execute on function public.record_carrier_document_view(uuid) to authenticated;
