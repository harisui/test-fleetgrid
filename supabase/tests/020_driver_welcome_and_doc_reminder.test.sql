-- 0030: the welcome text once per phone number ever (as an HMAC), and the missing-documents
-- reminder: who is a candidate and why one is left out, the 3-day claim, and who may touch it.
begin;
select no_plan();

select has_table('public', 'welcome_texts', 'the welcome table exists');
select has_column('public', 'drivers', 'last_doc_reminder_at', 'drivers carry the documents reminder stamp');
select has_column('public', 'notice_batches', 'excluded_recent', 'batches count the drivers reminded recently');
select ok((select relrowsecurity from pg_class where oid = 'public.welcome_texts'::regclass), 'the welcome table has RLS');
select ok(
  not has_function_privilege('authenticated', 'public.queue_welcome_text(text, uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_welcome_texts(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.doc_reminder_candidates(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_doc_reminder(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.claim_doc_reminder(uuid)', 'execute'),
  'nobody signed in may run the welcome or reminder functions'
);
select ok(
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'welcome_texts' and column_name ~ 'phone$'),
  'the welcome table keeps no phone number column, only its hash'
);

-- Drivers 71 to 77, all pending (Registered) with consent unless noted.
insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555599' || n
from unnest(array['71', '72', '73', '74', '75', '76', '77']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'driver', '+155555599' || n,
  (case when n = '75' then 'blocked' else 'pending' end)::public.account_status
from unnest(array['71', '72', '73', '74', '75', '76', '77']) as n;

create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;

insert into public.drivers (id, profile_id, full_name, operator_types, onboarding_step, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
select pg_temp.did(n), ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'Driver ' || n, '{cdl_driver}', 3,
  n <> '72', case when n <> '72' then now() end, case when n <> '72' then 'consent' end
from unnest(array['71', '72', '73', '74', '75', '76', '77']) as n;

update public.drivers set sms_opted_out = true, sms_opted_out_at = now() where id = pg_temp.did('73');
update public.drivers set last_doc_reminder_at = now() - interval '1 day' where id = pg_temp.did('74');
-- 76 has every document; 77 has both CDL photos.
insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
select pg_temp.did('76'), t::public.document_type, pg_temp.did('76') || '/' || t || '.png', t || '.png', 'image/png', 100
from unnest(array['cdl_front', 'cdl_back', 'medical_card']) as t;
insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
select pg_temp.did('77'), t::public.document_type, pg_temp.did('77') || '/' || t || '.png', t || '.png', 'image/png', 100
from unnest(array['cdl_front', 'cdl_back']) as t;

-- Missing documents.
select is(public.missing_documents(pg_temp.did('71')), array['cdl_front', 'cdl_back', 'medical_card'], 'nothing uploaded: all three');
select is(public.missing_documents(pg_temp.did('77')), array['medical_card'], 'both CDL photos: the medical card');
select is(public.missing_documents(pg_temp.did('76')), '{}'::text[], 'every document: nothing');

-- Candidates: Registered and missing something, with one reason each.
select results_eq(
  $$ select driver_id, exclusion from public.doc_reminder_candidates()
     where driver_id in (select pg_temp.did(n) from unnest(array['71','72','73','74','75','76','77']) as n)
     order by driver_id $$,
  $$ values
     ('d0000071-0000-4000-8000-000000000000'::uuid, null::text),
     ('d0000072-0000-4000-8000-000000000000'::uuid, 'no_consent'),
     ('d0000073-0000-4000-8000-000000000000'::uuid, 'opted_out'),
     ('d0000074-0000-4000-8000-000000000000'::uuid, 'recent'),
     ('d0000077-0000-4000-8000-000000000000'::uuid, null) $$,
  'candidates leave out the blocked and the complete, and say why the rest would be skipped'
);

-- The claim: once per 3 days, only when it may go.
select results_eq(
  $$ select phone, missing from public.claim_doc_reminder(pg_temp.did('77')) $$,
  $$ values ('+155555599' || '77', array['medical_card']) $$,
  'the claim returns the number and what is missing'
);
select ok((select last_doc_reminder_at is not null from public.drivers where id = pg_temp.did('77')), 'and stamps the driver');
select is_empty($$ select * from public.claim_doc_reminder(pg_temp.did('77')) $$, 'a second claim within 3 days gets nothing');
select is_empty($$ select * from public.claim_doc_reminder(pg_temp.did('72')) $$, 'no consent, no claim');
select is_empty($$ select * from public.claim_doc_reminder(pg_temp.did('73')) $$, 'opted out, no claim');
select is_empty($$ select * from public.claim_doc_reminder(pg_temp.did('74')) $$, 'reminded a day ago, no claim');
select is_empty($$ select * from public.claim_doc_reminder(pg_temp.did('75')) $$, 'blocked, no claim');
select is_empty($$ select * from public.claim_doc_reminder(pg_temp.did('76')) $$, 'nothing missing, no claim');
update public.drivers set last_doc_reminder_at = now() - interval '3 days 1 minute' where id = pg_temp.did('74');
select isnt_empty($$ select * from public.claim_doc_reminder(pg_temp.did('74')) $$, 'after 3 days it may go again');

-- The welcome: once per hash ever, with consent, never more than a day late.
select ok(public.queue_welcome_text(repeat('a', 64), pg_temp.did('71'), null), 'the first welcome for a number is queued');
select ok(not public.queue_welcome_text(repeat('a', 64), pg_temp.did('71'), null), 'never twice for the same number');
select throws_ok($$ select public.queue_welcome_text('+15555599071', pg_temp.did('71'), null) $$,
  '23514', null, 'only a 64-character hex hash is stored, never a number');
select results_eq(
  $$ select driver_id, phone, full_name from public.claim_welcome_texts(pg_temp.did('71')) $$,
  $$ values ('d0000071-0000-4000-8000-000000000000'::uuid, '+155555599' || '71', 'Driver 71') $$,
  'a due welcome is claimed with the number and name'
);
select is_empty($$ select * from public.claim_welcome_texts(pg_temp.did('71')) $$, 'and never again');

select ok(public.queue_welcome_text(repeat('b', 64), pg_temp.did('72'), null), 'a welcome for a driver without consent is queued');
select is_empty($$ select * from public.claim_welcome_texts(pg_temp.did('72')) $$, 'but never claimed');

select ok(public.queue_welcome_text(repeat('c', 64), pg_temp.did('77'), now() + interval '8 hours'), 'a night welcome waits');
select is_empty($$ select * from public.claim_welcome_texts(pg_temp.did('77')) $$, 'until its time');
update public.welcome_texts set due_at = now() - interval '2 days' where phone_hash = repeat('c', 64);
select is_empty($$ select * from public.claim_welcome_texts(pg_temp.did('77')) $$, 'and a welcome more than a day late never goes');

-- The hash outlives the account: the number is never welcomed again.
delete from auth.users where id = 'e0000071-0000-4000-8000-000000000000';
select ok(exists (select 1 from public.welcome_texts where phone_hash = repeat('a', 64) and driver_id is null), 'the hash stays after the account is deleted');
select ok(not public.queue_welcome_text(repeat('a', 64), pg_temp.did('77'), null), 'so the same number on a new account gets no second welcome');

-- A documents reminder batch.
insert into public.notice_batches (category, body, created_by, recipient_count, excluded_recent)
values ('doc_reminder', 'FleetGrid: To start getting shift offers, please upload your {items} at fleetgridus.com/driver. Reply STOP to opt out.',
  'e0000072-0000-4000-8000-000000000000', 2, 1);
select pass('a doc_reminder batch can be recorded');
select throws_ok($$ insert into public.notice_batches (category, body, created_by, excluded_recent)
  values ('doc_reminder', 'FleetGrid: x', 'e0000072-0000-4000-8000-000000000000', -1) $$,
  '23514', null, 'the recent count is never negative');

-- Nobody signed in reads the welcome table or moves the stamp.
select set_config('request.jwt.claims', json_build_object('sub', 'e0000077-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ select * from public.welcome_texts $$, '42501', null, 'a driver cannot read the welcome table');
select throws_ok($$ update public.drivers set last_doc_reminder_at = null where id = 'd0000077-0000-4000-8000-000000000000' $$,
  '42501', null, 'a driver cannot clear the reminder stamp');
reset role;

select * from finish();
rollback;
