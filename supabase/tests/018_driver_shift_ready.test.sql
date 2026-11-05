-- 0028: Registered and Shift-Ready (CR-5). Each requirement alone keeps a driver from
-- Shift-Ready; the override needs a reason; losing a requirement sends a Shift-Ready driver
-- back to Registered with re-review needed, audited as the system; no approved driver anywhere
-- misses a requirement after the live-data move.
begin;
select no_plan();

select is(
  (select count(*) from public.profiles p join public.drivers d on d.profile_id = p.id
   where p.role = 'driver' and p.status = 'approved' and d.roster_grace_until is null and cardinality(public.shift_ready_missing(d.id)) > 0),
  0::bigint,
  'after the live-data move every approved driver who misses a requirement is in the grace period'
);
select ok(not has_function_privilege('authenticated', 'public.shift_ready_missing(uuid)', 'execute'), 'signed-in users cannot list what a driver misses');

-- A finished Texas driver with a two-word name and all three documents, pending.
insert into auth.users (id, phone) values ('e0000051-0000-4000-8000-000000000000', '15555559751'), ('e0000052-0000-4000-8000-000000000000', '15555559752');
insert into public.profiles (id, role, phone, status) values
  ('e0000051-0000-4000-8000-000000000000', 'driver', '+15555559751', 'pending'),
  ('e0000052-0000-4000-8000-000000000000', 'admin', '+15555559752', 'approved');
insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, cdl_state, years_experience,
  city, state, zip, lat, lng, transmission, equipment_types, twic_active, medical_card_active, mvr_status,
  onboarding_step, card_completed)
values ('d0000051-0000-4000-8000-000000000000', 'e0000051-0000-4000-8000-000000000000', 'Ready Driver', '{cdl_driver}', 'A', 'TX', 5,
  'Houston', 'TX', '77002', 29.7594, -95.3594, 'manual_ok', '{dry_van}', true, true, 'clean', 12, true);

create function pg_temp.doc(p_type text) returns void language sql as $$
  insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
  values ('d0000051-0000-4000-8000-000000000000', p_type::public.document_type,
    'd0000051-0000-4000-8000-000000000000/' || p_type || '-' || gen_random_uuid() || '.png', p_type || '.png', 'image/png', 100);
$$;
create function pg_temp.missing() returns text[] language sql as $$
  select public.shift_ready_missing('d0000051-0000-4000-8000-000000000000');
$$;
create function pg_temp.status() returns text language sql as $$
  select status::text from public.profiles where id = 'e0000051-0000-4000-8000-000000000000';
$$;
create function pg_temp.approve() returns void language sql as $$
  update public.profiles set status = 'approved' where id = 'e0000051-0000-4000-8000-000000000000';
$$;

select is(pg_temp.missing(), array['cdl_front', 'cdl_back', 'medical_card'], 'no documents yet: the three are missing');
select throws_ok($$ select pg_temp.approve() $$, '23514', 'Not Shift-Ready: cdl_front, cdl_back, medical_card', 'and it cannot be Shift-Ready');
select pg_temp.doc('cdl_front');
select pg_temp.doc('cdl_back');
select throws_ok($$ select pg_temp.approve() $$, '23514', 'Not Shift-Ready: medical_card', 'the medical card alone blocks it');
select pg_temp.doc('medical_card');
select is(pg_temp.missing(), '{}'::text[], 'nothing missing');

-- Each other requirement alone.
update public.drivers set cdl_state = 'LA' where id = 'd0000051-0000-4000-8000-000000000000';
select throws_ok($$ select pg_temp.approve() $$, '23514', 'Not Shift-Ready: cdl_state', 'a CDL from another state alone blocks it');
update public.drivers set cdl_state = null where id = 'd0000051-0000-4000-8000-000000000000';
select throws_ok($$ select pg_temp.approve() $$, '23514', 'Not Shift-Ready: cdl_state', 'no CDL state blocks it too');
update public.drivers set cdl_state = 'TX', full_name = 'Ready' where id = 'd0000051-0000-4000-8000-000000000000';
select throws_ok($$ select pg_temp.approve() $$, '23514', 'Not Shift-Ready: last_name', 'a one-word name alone blocks it');
update public.drivers set full_name = 'Ready Driver', card_completed = false where id = 'd0000051-0000-4000-8000-000000000000';
select throws_ok($$ select pg_temp.approve() $$, '23514', 'Not Shift-Ready: profile', 'an unfinished card alone blocks it');
update public.drivers set card_completed = true where id = 'd0000051-0000-4000-8000-000000000000';

-- The override: a reason of at least five characters lets another state through.
select throws_ok($$ update public.drivers set shift_ready_override_reason = 'ok' where id = 'd0000051-0000-4000-8000-000000000000' $$,
  '23514', null, 'the override needs a real reason');
update public.drivers set cdl_state = 'LA', shift_ready_override_reason = 'Moving to Houston, Texas CDL in progress' where id = 'd0000051-0000-4000-8000-000000000000';
select lives_ok($$ select pg_temp.approve() $$, 'with the reason, a Louisiana CDL can be Shift-Ready');
select ok(public.is_shift_ready('d0000051-0000-4000-8000-000000000000'), 'is_shift_ready agrees');

-- A new required upload sends the driver back to Registered with re-review, audited as the system.
select pg_temp.doc('cdl_back');
select is(pg_temp.status(), 'pending', 'a new CDL photo moves a Shift-Ready driver back to Registered');
select is((select rereview_needed from public.drivers where id = 'd0000051-0000-4000-8000-000000000000'), true, 'with re-review needed');
select results_eq(
  $$ select admin_id::text, admin_phone, action, detail->>'reason' from public.admin_audit_log
     where target_id = 'd0000051-0000-4000-8000-000000000000' order by created_at desc limit 1 $$,
  $$ values ('00000000-0000-0000-0000-000000000000', 'system', 'driver_rereview_needed', 'document_uploaded:cdl_back') $$,
  'the audit log records it as a system action'
);
select pg_temp.approve();
select is((select rereview_needed from public.drivers where id = 'd0000051-0000-4000-8000-000000000000'), false, 'marking Shift-Ready again clears it');

-- Other documents do not matter; deleting a required one does.
select pg_temp.doc('other');
select is(pg_temp.status(), 'approved', 'another paper changes nothing');
delete from public.driver_documents where driver_id = 'd0000051-0000-4000-8000-000000000000' and type = 'medical_card';
select is(pg_temp.status(), 'pending', 'deleting the medical card moves the driver back');
select pg_temp.doc('medical_card');

-- The CDL state and the name.
update public.drivers set shift_ready_override_reason = null, cdl_state = 'TX' where id = 'd0000051-0000-4000-8000-000000000000';
select pg_temp.approve();
update public.drivers set cdl_state = 'OK' where id = 'd0000051-0000-4000-8000-000000000000';
select is(pg_temp.status(), 'pending', 'moving the CDL state away from Texas without an override moves the driver back');
update public.drivers set cdl_state = 'TX' where id = 'd0000051-0000-4000-8000-000000000000';
select pg_temp.approve();
update public.drivers set full_name = 'Driver' where id = 'd0000051-0000-4000-8000-000000000000';
select is(pg_temp.status(), 'pending', 'a one-word name moves the driver back');

-- A driver may not set the override or clear the flag.
select set_config('request.jwt.claims', json_build_object('sub', 'e0000051-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ update public.drivers set shift_ready_override_reason = 'I say so, trust me' where id = 'd0000051-0000-4000-8000-000000000000' $$,
  '42501', null, 'a driver cannot set the override');
select throws_ok($$ update public.drivers set rereview_needed = false where id = 'd0000051-0000-4000-8000-000000000000' $$,
  '42501', null, 'a driver cannot clear re-review');
reset role;

select * from finish();
rollback;
