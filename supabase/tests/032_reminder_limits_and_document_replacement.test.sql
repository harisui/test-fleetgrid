-- 0040: one reminder text of any kind per driver a week, the TWIC date text once, and one
-- paper per kind (the earlier one moves to driver_documents_replaced with its file kept).
begin;
select no_plan();

select has_table('public', 'driver_documents_replaced', 'the replaced papers table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.driver_documents_replaced'::regclass), 'it has RLS');
select ok(
  not has_function_privilege('authenticated', 'public.reminded_recently(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.reminded_recently(uuid)', 'execute')
  and not has_table_privilege('authenticated', 'public.driver_documents_replaced', 'insert')
  and not has_table_privilege('authenticated', 'public.driver_documents_replaced', 'delete'),
  'nobody signed in may run the check or write the replaced papers'
);

-- Drivers 81 to 85: texts on. 81 and 83 Registered, 82 Roster-Ready in grace, 84 Registered,
-- 85 Roster-Ready with every paper.
insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555598' || n
from unnest(array['81', '82', '83', '84', '85']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'driver', '+155555598' || n,
  (case when n in ('82', '85') then 'approved' else 'pending' end)::public.account_status
from unnest(array['81', '82', '83', '84', '85']) as n;

create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;

insert into public.drivers (id, profile_id, full_name, operator_types, onboarding_step, sms_opt_in, sms_opt_in_at, sms_opt_in_text, twic_active)
select pg_temp.did(n), ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'Driver ' || n, '{cdl_driver}', 3,
  true, now(), 'consent', n in ('81', '82', '83')
from unnest(array['81', '82', '83', '84', '85']) as n;

update public.drivers set roster_grace_until = now() + interval '14 days', cdl_state = null where id = pg_temp.did('82');
update public.drivers set cdl_state = 'TX' where id = pg_temp.did('85');

-- 81 had the TWIC text yesterday: no documents reminder for a week.
update public.drivers set twic_date_notice_at = now() - interval '1 day', twic_date_notice_count = 1 where id = pg_temp.did('81');
select ok(public.reminded_recently(pg_temp.did('81')), 'a TWIC text yesterday counts as a reminder this week');
select ok(not public.reminded_recently(pg_temp.did('84')), 'a driver never reminded is not');
select is((select exclusion from public.doc_reminder_candidates(pg_temp.did('81'))), 'recent', 'the documents button leaves them out, and says why');
select is_empty($$ select * from public.claim_doc_reminder(pg_temp.did('81')) $$, 'and the claim refuses them');
update public.drivers set twic_date_notice_at = now() - interval '7 days 1 minute' where id = pg_temp.did('81');
select isnt_empty($$ select * from public.claim_doc_reminder(pg_temp.did('81')) $$, 'a week later the documents reminder may go');

-- 82 gets the CDL-state text, and so no TWIC text in the same run.
select results_eq(
  $$ select driver_id from public.claim_cdl_state_notices() where driver_id = pg_temp.did('82') $$,
  $$ values (pg_temp.did('82')) $$,
  'the CDL-state text goes to the driver in grace'
);
select results_eq(
  $$ select driver_id from public.claim_twic_date_notices()
     where driver_id in (pg_temp.did('81'), pg_temp.did('82'), pg_temp.did('83')) $$,
  $$ values (pg_temp.did('83')) $$,
  'the TWIC text skips the driver texted a second ago and the one who had it, and goes once to the rest'
);
update public.drivers set twic_date_notice_at = now() - interval '30 days' where id = pg_temp.did('83');
select is_empty(
  $$ select * from public.claim_twic_date_notices() where driver_id = pg_temp.did('83') $$,
  'never a second TWIC text: the driver page keeps asking'
);

-- One paper per kind.
insert into public.driver_documents (id, driver_id, type, storage_path, file_name, mime_type, size_bytes, created_at)
values ('a4000000-0000-4000-8000-000000000001', pg_temp.did('84'), 'cdl_front', pg_temp.did('84') || '/front-1.jpg', 'front-1.jpg', 'image/jpeg', 100, now() - interval '1 minute');
insert into public.driver_documents (id, driver_id, type, storage_path, file_name, mime_type, size_bytes)
values ('a4000000-0000-4000-8000-000000000002', pg_temp.did('84'), 'cdl_front', pg_temp.did('84') || '/front-2.jpg', 'front-2.jpg', 'image/jpeg', 200);
select results_eq(
  $$ select id from public.driver_documents where driver_id = pg_temp.did('84') and type = 'cdl_front' $$,
  $$ values ('a4000000-0000-4000-8000-000000000002'::uuid) $$,
  'a new CDL front replaces the earlier one'
);
select results_eq(
  $$ select id, storage_path, file_name, replaced_by from public.driver_documents_replaced where driver_id = pg_temp.did('84') $$,
  $$ values ('a4000000-0000-4000-8000-000000000001'::uuid, pg_temp.did('84') || '/front-1.jpg', 'front-1.jpg', 'a4000000-0000-4000-8000-000000000002'::uuid) $$,
  'the earlier one is kept aside with its file path, naming what replaced it'
);
insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
values (pg_temp.did('84'), 'other', pg_temp.did('84') || '/other-1.pdf', 'other-1.pdf', 'application/pdf', 100),
       (pg_temp.did('84'), 'other', pg_temp.did('84') || '/other-2.pdf', 'other-2.pdf', 'application/pdf', 100);
select is((select count(*)::int from public.driver_documents where driver_id = pg_temp.did('84') and type = 'other'), 2, 'other papers still add up');

-- A Roster-Ready driver who replaces a paper goes to re-review once, as an upload.
alter table public.driver_documents disable trigger driver_documents_rereview;
insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
select pg_temp.did('85'), t::public.document_type, pg_temp.did('85') || '/' || t || '.png', t || '.png', 'image/png', 100
from unnest(array['cdl_front', 'cdl_back', 'medical_card']) as t;
alter table public.driver_documents enable trigger driver_documents_rereview;
insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
values (pg_temp.did('85'), 'cdl_back', pg_temp.did('85') || '/cdl_back-2.png', 'cdl_back-2.png', 'image/png', 100);
select results_eq(
  $$ select detail ->> 'reason' from public.admin_audit_log where target_id = pg_temp.did('85') $$,
  $$ values ('document_uploaded:cdl_back') $$,
  'one re-review entry, for the upload'
);
select is((select count(*)::int from public.driver_documents where driver_id = pg_temp.did('85')), 3, 'and still three papers');

select * from finish();
rollback;
