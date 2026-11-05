-- 0035: the logs can be read and added to, never edited or removed, by anyone, as anyone. Writes go
-- through the functions; a text's status is an event; deleting an account keeps the records and
-- only clears the link.
begin;
select no_plan();

select has_view('public', 'sms_messages_current', 'the latest status of each text');

insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555592' || n
from unnest(array['11', '12', '13']) as n;
insert into public.profiles (id, role, phone, status)
values ('e0000011-0000-4000-8000-000000000000', 'driver', '+15555559211', 'pending'),
  ('e0000012-0000-4000-8000-000000000000', 'admin', '+15555559212', 'approved'),
  ('e0000013-0000-4000-8000-000000000000', 'carrier', '+15555559213', 'approved');
insert into public.drivers (id, profile_id, full_name, operator_types, onboarding_step)
values ('d0000011-0000-4000-8000-000000000000', 'e0000011-0000-4000-8000-000000000000', 'Log Driver', '{cdl_driver}', 2);

-- The ways in, as the service role.
set local role service_role;
create temp table t_msg as select public.log_sms_message('outbound', 'offer', 'MG1', '+15555559211', 'FleetGrid: one', p_status => 'sending',
  p_driver_id => 'd0000011-0000-4000-8000-000000000000') as id;
select ok((select id is not null from t_msg), 'a text is logged through the function');
select public.sms_record_result((select id from t_msg), 'SMlog1', 'queued');
select is((select provider_sid from public.sms_messages where id = (select id from t_msg)), 'SMlog1', 'the Twilio SID is kept on the row');
select is((select status from public.sms_messages where id = (select id from t_msg)), 'sending', 'the row itself stays as written');
select is((select status from public.sms_messages_current where id = (select id from t_msg)), 'queued', 'the view shows the latest');
select public.sms_record_status('SMlog1', 'delivered');
select is((select status from public.sms_messages_current where id = (select id from t_msg)), 'delivered', 'a delivery report is an event');
select public.sms_record_status('SMlog1', 'undelivered', '30005');
select results_eq(
  $$ select status, error_code from public.sms_messages_current where id = (select id from t_msg) $$,
  $$ values ('undelivered'::text, '30005'::text) $$,
  'and the error comes with it'
);
select is((select count(*)::int from public.sms_status_events where message_id = (select id from t_msg)), 3, 'every change is kept');
select is(public.log_sms_message('inbound', 'inbound', '+15555559211', 'MG1', 'YES', p_provider_sid => 'SMlog1'), null::uuid, 'the same SID twice is refused quietly');

-- Held: taken once.
create temp table t_held as select public.log_sms_message('outbound', 'welcome', 'held', '+15555559211', 'FleetGrid: two', p_status => 'held') as id;
select ok(public.sms_claim_held((select id from t_held)), 'a held text can be taken');
select ok(not public.sms_claim_held((select id from t_held)), 'once');

-- The service role cannot go round them.
select throws_ok($$ insert into public.sms_messages (direction, kind, from_phone, to_phone, body) values ('outbound', 'offer', 'a', 'b', 'c') $$, '42501', null, 'the service role cannot insert a text directly');
select throws_ok($$ update public.sms_messages set body = 'changed' $$, '42501', null, 'cannot edit one');
select throws_ok($$ delete from public.sms_messages $$, '42501', null, 'cannot delete one');
select throws_ok($$ truncate public.sms_messages $$, '42501', null, 'cannot truncate');
select throws_ok($$ update public.sms_status_events set status = 'x' $$, '42501', null, 'cannot edit a status event');
select throws_ok($$ delete from public.admin_audit_log $$, '42501', null, 'cannot delete the audit log');
select throws_ok($$ update public.admin_audit_log set action = 'x' $$, '42501', null, 'cannot edit it');
select throws_ok($$ insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id) values (gen_random_uuid(), '+15555550000', 'driver_approved', 'driver', gen_random_uuid()) $$, '42501', null, 'cannot forge an entry');
select throws_ok($$ delete from public.document_views $$, '42501', null, 'cannot delete a document view');
select throws_ok($$ delete from public.shift_events $$, '42501', null, 'cannot delete a shift event');
select throws_ok($$ delete from public.tos_acceptances $$, '42501', null, 'cannot delete an acceptance');
reset role;

-- Not even the owner: the trigger holds.
select throws_ok($$ update public.sms_messages set body = 'changed' where id = (select id from t_msg) $$, '42501', null, 'the trigger refuses an edit, whoever asks');
select throws_ok($$ update public.sms_messages set provider_sid = 'SMother' where id = (select id from t_msg) $$, '42501', null, 'a SID is set once');
select throws_ok($$ delete from public.sms_messages where id = (select id from t_msg) $$, '42501', null, 'and a delete');
insert into public.shift_events (driver_id, kind, detail) values ('d0000011-0000-4000-8000-000000000000', 'booked', '{"check": "025"}');
select throws_ok($$ update public.shift_events set kind = 'ended' $$, '42501', null, 'shift events hold');
select throws_ok($$ delete from public.shift_events $$, '42501', null, 'both ways');
insert into public.document_views (viewer_id, viewer_role, driver_id, document_id, document_type)
values ('e0000012-0000-4000-8000-000000000000', 'admin', 'd0000011-0000-4000-8000-000000000000', gen_random_uuid(), 'cdl_front');
select throws_ok($$ update public.document_views set viewer_role = 'carrier' $$, '42501', null, 'document views hold');

-- An admin writes in their own name; the number comes from the profile.
select set_config('request.jwt.claims', json_build_object('sub', 'e0000012-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$ select public.write_admin_audit('driver_paused', 'driver', 'd0000011-0000-4000-8000-000000000000') $$, 'an admin writes through the function');
select throws_ok($$ insert into public.admin_audit_log (admin_id, admin_phone, action, target_type, target_id) values (auth.uid(), '+15555559212', 'driver_paused', 'driver', gen_random_uuid()) $$, '42501', null, 'not directly');
reset role;
select is((select admin_phone from public.admin_audit_log where action = 'driver_paused' and target_id = 'd0000011-0000-4000-8000-000000000000'), '+15555559212', 'in their own name');

-- Others cannot write it, and a carrier accepts Terms only as themselves.
select set_config('request.jwt.claims', json_build_object('sub', 'e0000013-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$ select public.write_admin_audit('driver_paused', 'driver', gen_random_uuid()) $$, '42501', null, 'a carrier cannot write the audit log');
select is((select count(*)::int from public.record_tos_acceptance('v-test', '203.0.113.9', 'Agent')), 1, 'a carrier accepts the Terms');
select is((select count(*)::int from public.record_tos_acceptance('v-test', '203.0.113.10', 'Other')), 1, 'twice keeps one row');
select results_eq($$ select ip, user_agent from public.tos_acceptances where version = 'v-test' $$, $$ values ('203.0.113.9'::text, 'Agent'::text) $$, 'the first');
reset role;

-- Deleting an account: the records stay, the link goes.
set local role service_role;
select public.anonymize_driver_logs('e0000011-0000-4000-8000-000000000000');
reset role;
select is((select driver_id from public.sms_messages where id = (select id from t_msg)), null, 'the text no longer points at the driver');
select is((select body from public.sms_messages where id = (select id from t_msg)), 'FleetGrid: one', 'and still says what it said');
select is((select count(*)::int from public.shift_events where driver_id is null and detail = '{"check": "025"}'), 1, 'shift events stay');
select is((select count(*)::int from public.document_views where driver_id is null and viewer_id = 'e0000012-0000-4000-8000-000000000000'), 1, 'document views stay');
delete from auth.users where id = 'e0000013-0000-4000-8000-000000000000';
select results_eq($$ select profile_id, version, ip from public.tos_acceptances where version = 'v-test' $$, $$ values (null::uuid, 'v-test'::text, '203.0.113.9'::text) $$, 'proof of acceptance outlives the account, with the IP');

select * from finish();
rollback;
