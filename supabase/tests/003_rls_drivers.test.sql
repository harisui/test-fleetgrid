-- RLS: drivers and driver_documents
begin;
select no_plan();

insert into auth.users (id, phone) values
  ('11111111-1111-4111-8111-111111111111', '15555559001'), -- driver A (has a card)
  ('22222222-2222-4222-8222-222222222222', '15555559002'), -- driver B (has a card)
  ('33333333-3333-4333-8333-333333333333', '15555559003'), -- admin
  ('44444444-4444-4444-8444-444444444444', '15555559004'), -- carrier
  ('55555555-5555-4555-8555-555555555555', '15555559005'), -- driver C (no card yet)
  ('66666666-6666-4666-8666-666666666666', '15555559006'); -- no profile

insert into public.profiles (id, role, phone, status) values
  ('11111111-1111-4111-8111-111111111111', 'driver', '+15555559001', 'approved'),
  ('22222222-2222-4222-8222-222222222222', 'driver', '+15555559002', 'approved'),
  ('33333333-3333-4333-8333-333333333333', 'admin', '+15555559003', 'approved'),
  ('44444444-4444-4444-8444-444444444444', 'carrier', '+15555559004', 'approved'),
  ('55555555-5555-4555-8555-555555555555', 'driver', '+15555559005', 'pending');

insert into public.drivers (id, profile_id, full_name, state, zip) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Driver A', 'TX', '75201'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Driver B', 'IL', '60601');

insert into public.driver_documents (id, driver_id, type, storage_path, file_name, mime_type, size_bytes) values
  ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cdl_front', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a1.jpg', 'a1.jpg', 'image/jpeg', 1000),
  ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cdl_front', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/b1.jpg', 'b1.jpg', 'image/jpeg', 1000);

create function pg_temp.sign_in(p_user uuid, p_phone text) returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'phone', p_phone)::text,
    true
  );
  set local role authenticated;
end;
$$;

create function pg_temp.sign_out() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Driver A: own card and documents only
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('11111111-1111-4111-8111-111111111111', '15555559001');

select results_eq(
  'select id from public.drivers',
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$$,
  'a driver sees only their own card'
);
select isnt_empty(
  $$update public.drivers set city = 'Dallas' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1$$,
  'a driver can update their own card'
);
select is_empty(
  $$update public.drivers set city = 'Hacked' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning 1$$,
  'a driver cannot update another card'
);
select is_empty(
  $$delete from public.drivers where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1$$,
  'a driver cannot delete their own card'
);
select is_empty(
  $$delete from public.drivers where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning 1$$,
  'a driver cannot delete another card'
);
select throws_ok(
  $$update public.drivers set profile_id = '55555555-5555-4555-8555-555555555555' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '42501', null, 'a driver cannot give their card to another profile'
);

select results_eq(
  'select id from public.driver_documents',
  $$values ('a0000000-0000-4000-8000-000000000001'::uuid)$$,
  'a driver sees only their own documents'
);
select lives_ok(
  $$insert into public.driver_documents (id, driver_id, type, storage_path, file_name, mime_type, size_bytes)
    values ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'medical_card', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/a2.pdf', 'a2.pdf', 'application/pdf', 2000)$$,
  'a driver can add a document to their own card'
);
select throws_ok(
  $$insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'other', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/x.pdf', 'x.pdf', 'application/pdf', 2000)$$,
  '42501', null, 'a driver cannot add a document to another card'
);
select throws_ok(
  $$insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'other', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/steal.pdf', 'x.pdf', 'application/pdf', 2000)$$,
  '42501', null, 'a document cannot point at a file in another driver folder'
);
select is_empty(
  $$update public.driver_documents set file_name = 'renamed.jpg' where id = 'a0000000-0000-4000-8000-000000000001' returning 1$$,
  'a driver cannot edit document rows (insert and delete only)'
);
select is_empty(
  $$delete from public.driver_documents where id = 'b0000000-0000-4000-8000-000000000001' returning 1$$,
  'a driver cannot delete another driver document'
);
select isnt_empty(
  $$delete from public.driver_documents where id = 'a0000000-0000-4000-8000-000000000002' returning 1$$,
  'a driver can delete their own document'
);
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Driver C: creating a card
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('55555555-5555-4555-8555-555555555555', '15555559005');
select is_empty('select 1 from public.drivers', 'a driver without a card sees no cards');
select is_empty('select 1 from public.driver_documents', 'a driver without a card sees no documents');
select throws_ok(
  $$insert into public.drivers (profile_id, full_name, state, zip) values ('11111111-1111-4111-8111-111111111111', 'Fake', 'TX', '75201')$$,
  '42501', null, 'a driver cannot create a card for another profile'
);
select throws_ok(
  $$insert into public.drivers (profile_id, full_name, state, zip, sms_opted_out) values ('55555555-5555-4555-8555-555555555555', 'Driver C', 'TX', '75201', true)$$,
  '42501', null, 'a card cannot be created with opt-out state set'
);
select lives_ok(
  $$insert into public.drivers (id, profile_id, full_name, state, zip) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '55555555-5555-4555-8555-555555555555', 'Driver C', 'TX', '75201')$$,
  'a driver can create their own card'
);
select throws_ok(
  $$insert into public.drivers (profile_id, full_name, state, zip) values ('55555555-5555-4555-8555-555555555555', 'Driver C again', 'TX', '75201')$$,
  '23505', null, 'a driver cannot create a second card'
);
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Carrier (Milestone 1): no access to drivers or documents
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('44444444-4444-4444-8444-444444444444', '15555559004');
select is_empty('select 1 from public.drivers', 'a carrier sees no driver cards in Milestone 1');
select is_empty('select 1 from public.driver_documents', 'a carrier sees no driver documents');
select throws_ok(
  $$insert into public.drivers (profile_id, full_name, state, zip) values ('44444444-4444-4444-8444-444444444444', 'Carrier as driver', 'TX', '75201')$$,
  '42501', null, 'a carrier cannot create a driver card'
);
select is_empty(
  $$update public.drivers set city = 'Hacked' returning 1$$,
  'a carrier cannot update driver cards'
);
select throws_ok(
  $$insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'other', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/c.pdf', 'c.pdf', 'application/pdf', 2000)$$,
  '42501', null, 'a carrier cannot add driver documents'
);
select is_empty('delete from public.driver_documents returning 1', 'a carrier cannot delete driver documents');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Signed in without a profile
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('66666666-6666-4666-8666-666666666666', '15555559006');
select is_empty('select 1 from public.drivers', 'a user without a profile sees no cards');
select throws_ok(
  $$insert into public.drivers (profile_id, full_name, state, zip) values ('66666666-6666-4666-8666-666666666666', 'No profile', 'TX', '75201')$$,
  '42501', null, 'a user without a driver profile cannot create a card'
);
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Admin: everything
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('33333333-3333-4333-8333-333333333333', '15555559003');
select cmp_ok((select count(*) from public.drivers), '>=', 3::bigint, 'an admin sees all cards');
select cmp_ok((select count(*) from public.driver_documents), '>=', 2::bigint, 'an admin sees all documents');
select isnt_empty(
  $$update public.drivers set city = 'Chicago' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning 1$$,
  'an admin can update any card'
);
select isnt_empty(
  $$update public.driver_documents set file_name = 'reviewed.jpg' where id = 'b0000000-0000-4000-8000-000000000001' returning 1$$,
  'an admin can update any document row'
);
select lives_ok(
  $$insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'other', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/admin.pdf', 'admin.pdf', 'application/pdf', 2000)$$,
  'an admin can add a document to any card'
);
select isnt_empty(
  $$delete from public.driver_documents where id = 'b0000000-0000-4000-8000-000000000001' returning 1$$,
  'an admin can delete any document'
);
select isnt_empty(
  $$delete from public.drivers where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' returning 1$$,
  'an admin can delete any card'
);
select pg_temp.sign_out();

select * from finish();
rollback;
