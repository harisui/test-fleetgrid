-- The 14-day grace for drivers approved before CR-5 (0028, user decision of 2026-11-05). In grace a
-- driver missing requirements stays listed and matched and is not sent back by an upload. When it
-- ends the job moves anyone still incomplete to Registered, audited; anyone complete stays. A new
-- driver gets no grace: the gate still refuses them.
begin;
select no_plan();

select has_column('public', 'drivers', 'roster_grace_until', 'drivers carry the grace stamp');
select ok(not has_function_privilege('authenticated', 'public.expire_roster_grace()', 'execute'), 'signed-in users cannot run the job');
select is_empty($$ select 1 from public.drivers where roster_grace_until is not null $$, 'the seed has no one in grace: the move ran before it');

-- 71 in grace with nothing on file, 72 in grace and complete, 73 past its grace and incomplete,
-- 74 past its grace and complete, 75 a new driver without grace, 76 in grace and blocked.
insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555597' || n
from unnest(array['71', '72', '73', '74', '75', '76']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'driver', '+155555597' || n, 'pending'
from unnest(array['71', '72', '73', '74', '75', '76']) as n;

create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;

insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, cdl_state, endorsements,
  years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
  twic_active, medical_card_active, mvr_status, onboarding_step, card_completed, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
select pg_temp.did(n), ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'Driver ' || n, '{cdl_driver}', 'A',
  case when n in ('72', '74') then 'TX' end, '{H}', 8,
  'Houston', 'TX', '77002', 29.7594, -95.3594, 50, 'manual_ok', '{dry_van}', true, true, 'clean', 12, true, true, now(), 'consent'
from unnest(array['71', '72', '73', '74', '75', '76']) as n;

insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
select pg_temp.did(n), t::public.document_type, pg_temp.did(n) || '/' || t || '.png', t || '.png', 'image/png', 100
from unnest(array['72', '74']) as n cross join unnest(array['cdl_front', 'cdl_back', 'medical_card']) as t;

-- Approved before CR-5 and stamped by the move: built here the way the migration leaves them.
alter table public.profiles disable trigger profiles_shift_ready_gate;
update public.profiles set status = 'approved'
where id in (select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid from unnest(array['71', '72', '73', '74', '76']) as n);
alter table public.profiles enable trigger profiles_shift_ready_gate;
update public.drivers set roster_grace_until = now() + interval '14 days' where id in (pg_temp.did('71'), pg_temp.did('72'), pg_temp.did('76'));
update public.drivers set roster_grace_until = now() - interval '1 minute' where id in (pg_temp.did('73'), pg_temp.did('74'));
update public.drivers set shifts_paused = true where id not in (select pg_temp.did(n) from unnest(array['71', '72', '73', '74', '75', '76']) as n);

-- In grace.
select ok(public.is_shift_ready(pg_temp.did('71')), 'in grace and missing everything: still counts');
select ok(not public.is_shift_ready(pg_temp.did('73')), 'past the grace and missing something: does not');
select ok(not public.is_shift_ready(pg_temp.did('75')), 'a new driver gets no grace');
select results_eq(
  $$ select driver_id from public.matching_drivers(29.7594, -95.3594, 'A', '{}', 0, '{}', false, false, false) order by driver_id $$,
  $$ values (pg_temp.did('71')), (pg_temp.did('72')), (pg_temp.did('74')), (pg_temp.did('76')) $$,
  'matching includes grace drivers and complete ones, not one past its grace or a new one'
);

-- The gate holds for a new driver.
select throws_ok($$ update public.profiles set status = 'approved' where id = 'e0000075-0000-4000-8000-000000000000' $$,
  '23514', null, 'the full rule applies to a new driver at once');

-- An upload in grace flags the driver and does not send them back.
insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
values (pg_temp.did('71'), 'cdl_front', pg_temp.did('71') || '/cdl_front.png', 'cdl_front.png', 'image/png', 100);
select is((select status::text from public.profiles where id = 'e0000071-0000-4000-8000-000000000000'), 'approved', 'an upload in grace keeps the driver listed');
select ok((select rereview_needed from public.drivers where id = pg_temp.did('71')), 'and flags them for an admin to look');

-- Reminders reach a driver in grace who is missing a document.
select is((select exclusion from public.doc_reminder_candidates(pg_temp.did('71'))), null::text, 'a driver in grace can get the documents reminder');
select is_empty($$ select * from public.doc_reminder_candidates(pg_temp.did('72')) $$, 'one with every document is not a candidate');

-- The one CDL-state text: 71 has no CDL state and misses documents, 72 has one, 76 misses it too.
select ok(not has_function_privilege('authenticated', 'public.claim_cdl_state_notices()', 'execute'), 'signed-in users cannot claim the CDL-state text');
update public.drivers set sms_opt_in = false, sms_opt_in_at = null, sms_opt_in_text = null where id = pg_temp.did('76');
select results_eq(
  $$ select driver_id, missing from public.claim_cdl_state_notices() $$,
  $$ values (pg_temp.did('71'), array['cdl_back', 'medical_card']) $$,
  'it goes only to a driver in grace with no CDL state and texts on, naming the documents too'
);
select ok((select last_doc_reminder_at is not null from public.drivers where id = pg_temp.did('71')), 'and counts as the documents reminder');
select is_empty($$ select * from public.claim_cdl_state_notices() $$, 'only once');

-- A change of status ends the grace.
update public.profiles set status = 'blocked' where id = 'e0000076-0000-4000-8000-000000000000';
select is((select roster_grace_until from public.drivers where id = pg_temp.did('76')), null, 'blocking ends the grace');

-- The job.
select results_eq(
  $$ select driver_id from public.expire_roster_grace() $$,
  $$ values (pg_temp.did('73')) $$,
  'the job moves only the driver past their grace and still incomplete'
);
select is((select status::text from public.profiles where id = 'e0000073-0000-4000-8000-000000000000'), 'pending', 'to Registered');
select is((select status::text from public.profiles where id = 'e0000074-0000-4000-8000-000000000000'), 'approved', 'one who finished in time stays');
select is((select roster_grace_until from public.drivers where id = pg_temp.did('74')), null, 'and loses the stamp');
select is((select roster_grace_until from public.drivers where id = pg_temp.did('71')) > now(), true, 'one still in grace is untouched');
select results_eq(
  $$ select admin_id, admin_phone, action from public.admin_audit_log where target_id = pg_temp.did('73') $$,
  $$ values ('00000000-0000-0000-0000-000000000000'::uuid, 'system'::text, 'driver_grace_expired'::text) $$,
  'audited with the system as actor'
);
select is_empty($$ select * from public.expire_roster_grace() $$, 'running it again moves nobody');

-- A driver cannot give themselves time.
select set_config('request.jwt.claims', json_build_object('sub', 'e0000075-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ update public.drivers set roster_grace_until = now() + interval '1 year' where id = 'd0000075-0000-4000-8000-000000000000' $$,
  '42501', null, 'a driver cannot set the grace');
reset role;

select * from finish();
rollback;
