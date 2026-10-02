-- Storage: private driver-documents bucket and object policies
--
-- Supabase blocks direct SQL deletes on storage.objects (storage.protect_delete),
-- so delete rules are proven through the real Storage API in
-- tests/integration/rls/storage.test.ts. This file checks that the delete policy exists.
begin;
select no_plan();

insert into auth.users (id, phone) values
  ('11111111-1111-4111-8111-111111111111', '15555559001'), -- driver A
  ('22222222-2222-4222-8222-222222222222', '15555559002'), -- driver B
  ('33333333-3333-4333-8333-333333333333', '15555559003'), -- admin
  ('44444444-4444-4444-8444-444444444444', '15555559004'); -- carrier

insert into public.profiles (id, role, phone, status) values
  ('11111111-1111-4111-8111-111111111111', 'driver', '+15555559001', 'approved'),
  ('22222222-2222-4222-8222-222222222222', 'driver', '+15555559002', 'approved'),
  ('33333333-3333-4333-8333-333333333333', 'admin', '+15555559003', 'approved'),
  ('44444444-4444-4444-8444-444444444444', 'carrier', '+15555559004', 'approved');

insert into public.drivers (id, profile_id, full_name, state, zip) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Driver A', 'TX', '75201'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Driver B', 'IL', '60601');

insert into storage.objects (bucket_id, name) values
  ('driver-documents', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/seed-a.jpg'),
  ('driver-documents', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/seed-b.jpg');

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

create function pg_temp.upload(p_name text) returns text language sql as $$
  select format($f$insert into storage.objects (bucket_id, name) values ('driver-documents', %L)$f$, p_name);
$$;

-- ---------------------------------------------------------------------------
-- Bucket configuration
-- ---------------------------------------------------------------------------
select results_eq(
  $$select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'driver-documents'$$,
  $$values (false, 10485760::bigint, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])$$,
  'driver-documents is private, capped at 10 MB, and limited to images and PDF'
);

select policies_are(
  'storage', 'objects',
  array['driver_documents_objects_select', 'driver_documents_objects_insert', 'driver_documents_objects_delete'],
  'storage.objects has exactly the three driver-documents policies'
);
select policy_cmd_is('storage', 'objects', 'driver_documents_objects_delete', 'delete', 'the delete policy applies to DELETE');
select policy_roles_are('storage', 'objects', 'driver_documents_objects_delete', array['authenticated'], 'the delete policy is for signed-in users only');

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------
set local role anon;
select is_empty(
  $$select 1 from storage.objects where bucket_id = 'driver-documents'$$,
  'anon sees no files'
);
select throws_ok(
  pg_temp.upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/anon.jpg'),
  '42501', null, 'anon cannot upload'
);
reset role;

-- ---------------------------------------------------------------------------
-- Driver A: own folder only
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('11111111-1111-4111-8111-111111111111', '15555559001');

select results_eq(
  $$select name from storage.objects where bucket_id = 'driver-documents'$$,
  $$values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/seed-a.jpg')$$,
  'a driver sees only files in their own folder'
);

select lives_ok(pg_temp.upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/one.jpg'), 'jpg upload into own folder');
select lives_ok(pg_temp.upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/two.JPEG'), 'jpeg upload (any case)');
select lives_ok(pg_temp.upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/three.png'), 'png upload');
select lives_ok(pg_temp.upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/four.webp'), 'webp upload');
select lives_ok(pg_temp.upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/five.pdf'), 'pdf upload');

select throws_ok(
  pg_temp.upload('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/intruder.jpg'),
  '42501', null, 'a driver cannot upload into another driver folder'
);
select throws_ok(pg_temp.upload('root.jpg'), '42501', null, 'a driver cannot upload to the bucket root');
select throws_ok(
  pg_temp.upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/nested/deep.jpg'),
  '42501', null, 'nested folders are rejected'
);
select throws_ok(
  pg_temp.upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/malware.exe'),
  '42501', null, 'a disallowed extension is rejected'
);
select throws_ok(
  pg_temp.upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/noextension'),
  '42501', null, 'a file without an extension is rejected'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('other-bucket', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/x.jpg')$$,
  null, null, 'a driver cannot write to any other bucket'
);

select is_empty(
  $$update storage.objects set name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/renamed.jpg'
     where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/one.jpg' returning 1$$,
  'files cannot be overwritten or moved'
);
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Driver B cannot see what driver A uploaded
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('22222222-2222-4222-8222-222222222222', '15555559002');
select results_eq(
  $$select name from storage.objects where bucket_id = 'driver-documents'$$,
  $$values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/seed-b.jpg')$$,
  'driver B sees only their own files'
);
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Carrier: nothing in Milestone 1
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('44444444-4444-4444-8444-444444444444', '15555559004');
select is_empty(
  $$select 1 from storage.objects where bucket_id = 'driver-documents'$$,
  'a carrier sees no driver files'
);
select throws_ok(
  pg_temp.upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/carrier.jpg'),
  '42501', null, 'a carrier cannot upload driver files'
);
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Admin: read all
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('33333333-3333-4333-8333-333333333333', '15555559003');
select is(
  (select count(*) from storage.objects where bucket_id = 'driver-documents'),
  7::bigint,
  'an admin sees every file'
);
select pg_temp.sign_out();

select * from finish();
rollback;
