-- Other papers: at most five certification documents per driver (migration 0008).
begin;
select no_plan();

insert into auth.users (id, phone) values
  ('11111111-1111-4111-8111-111111111111', '15555559001'),
  ('22222222-2222-4222-8222-222222222222', '15555559002');

insert into public.profiles (id, role, phone, status) values
  ('11111111-1111-4111-8111-111111111111', 'driver', '+15555559001', 'approved'),
  ('22222222-2222-4222-8222-222222222222', 'driver', '+15555559002', 'approved');

insert into public.drivers (id, profile_id, full_name, state, zip) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Driver A', 'TX', '75201'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Driver B', 'IL', '60601');

select has_function('public', 'enforce_certification_document_limit', 'limit trigger function exists');
select trigger_is(
  'public', 'driver_documents', 'driver_documents_certification_limit',
  'public', 'enforce_certification_document_limit',
  'limit trigger is attached to driver_documents'
);

create function pg_temp.add_paper(p_driver uuid, p_type public.document_type, p_name text) returns text language sql as $$
  select format(
    $f$insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
       values ('%s', '%s', '%s/%s.pdf', '%s', 'application/pdf', 1000)$f$,
    p_driver, p_type, p_driver, p_name, p_name
  );
$$;

select lives_ok(pg_temp.add_paper('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'certification', 'cert-1'), 'first other paper accepted');
select lives_ok(pg_temp.add_paper('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'certification', 'cert-2'), 'second other paper accepted');
select lives_ok(pg_temp.add_paper('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'certification', 'cert-3'), 'third other paper accepted');
select lives_ok(pg_temp.add_paper('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'certification', 'cert-4'), 'fourth other paper accepted');
select lives_ok(pg_temp.add_paper('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'certification', 'cert-5'), 'fifth other paper accepted');
select throws_ok(
  pg_temp.add_paper('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'certification', 'cert-6'),
  '23514', null, 'sixth other paper rejected as a check violation'
);
select lives_ok(pg_temp.add_paper('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cdl_front', 'front'), 'other types are not limited');
select lives_ok(pg_temp.add_paper('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'certification', 'cert-b1'), 'the limit is per driver');

delete from public.driver_documents where file_name = 'cert-3';
select lives_ok(pg_temp.add_paper('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'certification', 'cert-6'), 'removing one frees a slot');
select results_eq(
  $$select count(*)::int from public.driver_documents
     where driver_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and type = 'certification'$$,
  $$values (5)$$,
  'driver A keeps exactly five other papers'
);

select * from finish();
rollback;
