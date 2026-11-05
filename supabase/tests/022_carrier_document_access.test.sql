-- 0031: a carrier opens a driver's CDL and medical card only for a shift that driver booked with
-- it, from the booking until 7 days after it ends. Never from search. Every view is logged.
begin;
select no_plan();

select has_table('public', 'document_views', 'the view log exists');
select ok((select relrowsecurity from pg_class where oid = 'public.document_views'::regclass), 'the view log has RLS');

insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555596' || n
from unnest(array['81', '82', '83', '84']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, r::public.user_role, '+155555596' || n, 'approved'
from (values ('81', 'driver'), ('82', 'carrier'), ('83', 'carrier'), ('84', 'carrier')) as t(n, r);
update public.profiles set status = 'pending' where id = 'e0000081-0000-4000-8000-000000000000';

insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, cdl_state, endorsements,
  years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
  twic_active, medical_card_active, mvr_status, onboarding_step, card_completed, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
values ('d0000081-0000-4000-8000-000000000000', 'e0000081-0000-4000-8000-000000000000', 'Dana Driver', '{cdl_driver}', 'A', 'TX', '{H}', 8,
  'Houston', 'TX', '77002', 29.7594, -95.3594, 50, 'manual_ok', '{dry_van}', true, true, 'clean', 12, true, true, now(), 'consent');

insert into public.driver_documents (id, driver_id, type, storage_path, file_name, mime_type, size_bytes)
select id::uuid, 'd0000081-0000-4000-8000-000000000000', t::public.document_type, 'd0000081-0000-4000-8000-000000000000/' || t || '.png', t || '.png', 'image/png', 100
from (values ('a1000000-0000-4000-8000-000000000001', 'cdl_front'), ('a1000000-0000-4000-8000-000000000002', 'cdl_back'),
  ('a1000000-0000-4000-8000-000000000003', 'medical_card'), ('a1000000-0000-4000-8000-000000000004', 'certification')) as t(id, t);
update public.profiles set status = 'approved' where id = 'e0000081-0000-4000-8000-000000000000';

insert into storage.objects (bucket_id, name, owner, metadata)
select 'driver-documents', storage_path, 'e0000081-0000-4000-8000-000000000000', '{"mimetype":"image/png","size":100}'::jsonb
from public.driver_documents where driver_id = 'd0000081-0000-4000-8000-000000000000';

-- 82 books, 83 is another subscribed carrier, 84 booked once but its subscription lapsed.
insert into public.carriers (id, profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng, stripe_customer_id)
select ('c00000' || n || '-0000-4000-a000-000000000000')::uuid, ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'Co ' || n, 'Sam Owner',
  'sam' || n || '@co.test', 'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_' || n
from unnest(array['82', '83', '84']) as n;
insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status)
values ('c0000082-0000-4000-a000-000000000000', 'sub_82', 'cus_82', 'active'),
  ('c0000083-0000-4000-a000-000000000000', 'sub_83', 'cus_83', 'active'),
  ('c0000084-0000-4000-a000-000000000000', 'sub_84', 'cus_84', 'canceled');

create function pg_temp.make_shift(id uuid, carrier uuid, code text, status public.shift_status, driver uuid, ends timestamptz)
returns void language sql as $$
  insert into public.shifts (id, carrier_id, short_code, status, booked_driver_id, booked_at, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone, broadcast_round)
  values (id, carrier, code, status, driver, case when driver is not null then now() end, ends - interval '8 hours', ends, '77002', 'Houston', 'TX', 29.7594, -95.3594,
    'Yard moves for the check.', 'Lee Yard', '+17135550100', 1);
$$;

select pg_temp.make_shift('50000081-0000-4000-8000-000000000000', 'c0000082-0000-4000-a000-000000000000', '8101', 'booked', 'd0000081-0000-4000-8000-000000000000', now() + interval '1 day');
select pg_temp.make_shift('50000084-0000-4000-8000-000000000000', 'c0000084-0000-4000-a000-000000000000', '8104', 'booked', 'd0000081-0000-4000-8000-000000000000', now() + interval '1 day');

create function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
$$;

-- The booking carrier: the three required types, not a certification, and the files.
select pg_temp.as_user('e0000082-0000-4000-8000-000000000000');
set local role authenticated;
select set_eq(
  $$ select type::text from public.driver_documents where driver_id = 'd0000081-0000-4000-8000-000000000000' $$,
  $$ values ('cdl_front'), ('cdl_back'), ('medical_card') $$,
  'the booking carrier reads the CDL and medical card, not other papers'
);
select is((select count(*)::int from storage.objects where bucket_id = 'driver-documents' and name like 'd0000081-%'), 3, 'and exactly those files');
select ok(public.record_carrier_document_view('a1000000-0000-4000-8000-000000000001'), 'a view is recorded');
select ok(not public.record_carrier_document_view('a1000000-0000-4000-8000-000000000004'), 'a certification view is refused');
select is_empty($$ select 1 from public.document_views $$, 'a carrier cannot read the log');
select throws_ok($$ insert into public.document_views (viewer_id, viewer_role, driver_id, document_id, document_type)
  values (auth.uid(), 'carrier', 'd0000081-0000-4000-8000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'cdl_front') $$,
  '42501', null, 'a carrier cannot write the log directly');
reset role;
select results_eq(
  $$ select viewer_id, viewer_role, driver_id, document_type::text, shift_id from public.document_views $$,
  $$ values ('e0000082-0000-4000-8000-000000000000'::uuid, 'carrier'::text, 'd0000081-0000-4000-8000-000000000000'::uuid, 'cdl_front'::text, '50000081-0000-4000-8000-000000000000'::uuid) $$,
  'the log says who, which driver, which document, which shift'
);

-- Another subscribed carrier: nothing, from search or by asking directly.
select pg_temp.as_user('e0000083-0000-4000-8000-000000000000');
set local role authenticated;
select is_empty($$ select 1 from public.driver_documents where driver_id = 'd0000081-0000-4000-8000-000000000000' $$, 'another carrier reads no documents');
select is_empty($$ select 1 from storage.objects where bucket_id = 'driver-documents' and name like 'd0000081-%' $$, 'and no files');
select ok(not public.record_carrier_document_view('a1000000-0000-4000-8000-000000000001'), 'and its view is refused');
reset role;

-- A carrier whose subscription lapsed.
select pg_temp.as_user('e0000084-0000-4000-8000-000000000000');
set local role authenticated;
select is_empty($$ select 1 from public.driver_documents where driver_id = 'd0000081-0000-4000-8000-000000000000' $$, 'no subscription, no documents, even with a booking');
reset role;

-- The window: open until 7 days after the end, closed after.
update public.shifts set starts_at = now() - interval '6 days 8 hours', ends_at = now() - interval '6 days' where id = '50000081-0000-4000-8000-000000000000';
select pg_temp.as_user('e0000082-0000-4000-8000-000000000000');
set local role authenticated;
select is((select count(*)::int from public.driver_documents where driver_id = 'd0000081-0000-4000-8000-000000000000'), 3, '6 days after it ended: still open');
reset role;
update public.shifts set starts_at = now() - interval '8 days 8 hours', ends_at = now() - interval '8 days' where id = '50000081-0000-4000-8000-000000000000';
set local role authenticated;
select is_empty($$ select 1 from public.driver_documents where driver_id = 'd0000081-0000-4000-8000-000000000000' $$, '8 days after it ended: closed');
reset role;

-- Released or cancelled: closed at once.
update public.shifts set starts_at = now() + interval '1 day', ends_at = now() + interval '1 day 8 hours' where id = '50000081-0000-4000-8000-000000000000';
update public.shifts set status = 'cancelled', cancelled_at = now() where id = '50000081-0000-4000-8000-000000000000';
set local role authenticated;
select is_empty($$ select 1 from public.driver_documents where driver_id = 'd0000081-0000-4000-8000-000000000000' $$, 'cancelled: closed at once');
reset role;
update public.shifts set status = 'open', cancelled_at = null, booked_driver_id = null, booked_at = null, released_at = now() where id = '50000081-0000-4000-8000-000000000000';
set local role authenticated;
select is_empty($$ select 1 from public.driver_documents where driver_id = 'd0000081-0000-4000-8000-000000000000' $$, 'released: closed at once');
reset role;

-- The driver keeps their own.
select pg_temp.as_user('e0000081-0000-4000-8000-000000000000');
set local role authenticated;
select is((select count(*)::int from public.driver_documents), 4, 'the driver still reads all their own documents');
reset role;

select * from finish();
rollback;
