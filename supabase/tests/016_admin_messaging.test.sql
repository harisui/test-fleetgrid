-- 0026: notice batches, the resend link, inbound outcomes, and who a bulk notice reaches.
begin;
select no_plan();

select has_table('public', 'notice_batches', 'notice_batches exists');
select hasnt_column('public', 'notice_batches', 'created_by_phone', 'the batch keeps the user id only, no phone');
select has_column('public', 'sms_messages', 'resend_of', 'texts link to the one they resend');
select has_column('public', 'sms_messages', 'inbound_outcome', 'replies record what they turned out to be');
select ok(
  not has_function_privilege('authenticated', 'public.notice_recipients(uuid)', 'execute'),
  'signed-in users cannot list notice recipients'
);

insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555595' || n
from unnest(array['31', '32', '33', '34', '35', '36', '37']) as n;
insert into public.profiles (id, role, phone, status)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, r::public.user_role, '+155555595' || n, s::public.account_status
from (values ('31', 'admin', 'approved'), ('32', 'driver', 'approved'), ('33', 'driver', 'pending'),
  ('34', 'driver', 'approved'), ('35', 'driver', 'blocked'), ('36', 'driver', 'approved'), ('37', 'carrier', 'approved')) as t(n, r, s);

create function pg_temp.did(n text) returns uuid language sql as $$
  select ('d00000' || n || '-0000-4000-8000-000000000000')::uuid;
$$;

-- 32 consenting in Houston; 33 consenting, pending, paused (still gets account notices);
-- 34 opted out; 35 blocked; 36 never consented, in Dallas.
insert into public.drivers (id, profile_id, full_name, operator_types, onboarding_step, sms_opt_in, sms_opt_in_at, sms_opt_in_text, lat, lng, zip, city, state)
select pg_temp.did(n), ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, 'Driver ' || n, '{cdl_driver}', 3,
  n <> '36', case when n <> '36' then now() end, case when n <> '36' then 'consent' end,
  case when n = '36' then 32.7904 else 29.7594 end, case when n = '36' then -96.8044 else -95.3594 end,
  case when n = '36' then '75201' else '77002' end, case when n = '36' then 'Dallas' else 'Houston' end, 'TX'
from unnest(array['32', '33', '34', '35', '36']) as n;
update public.drivers set shifts_paused = true where id = pg_temp.did('33');
update public.drivers set sms_opted_out = true, sms_opted_out_at = now() where id = pg_temp.did('34');

create temp table mine as select pg_temp.did(n) as id from unnest(array['32', '33', '34', '35', '36']) as n;

select set_eq(
  $$ select driver_id, exclusion from public.notice_recipients() where driver_id in (select id from mine) $$,
  $$ values ('d0000032-0000-4000-8000-000000000000'::uuid, null::text),
            ('d0000033-0000-4000-8000-000000000000'::uuid, null::text),
            ('d0000034-0000-4000-8000-000000000000'::uuid, 'opted_out'),
            ('d0000035-0000-4000-8000-000000000000'::uuid, 'blocked'),
            ('d0000036-0000-4000-8000-000000000000'::uuid, 'no_consent') $$,
  'consenting drivers get it (paused and pending too); opted out, blocked and no consent are left out with the reason'
);
select set_eq(
  $$ select driver_id from public.notice_recipients((select id from public.service_areas where name = 'Houston, TX'))
     where driver_id in (select id from mine) $$,
  $$ select pg_temp.did(n) from unnest(array['32', '33', '34', '35']) as n $$,
  'the area filter keeps only drivers inside it'
);

-- Batches and resends.
insert into public.notice_batches (id, category, variables, body, created_by, status)
values ('b0000001-0000-4000-8000-000000000000', 'service_notice', '{"service":"logins"}',
  'FleetGrid: Logins are delayed until about 3:00 PM. We''ll text you when it''s fixed. Reply STOP to opt out.',
  'e0000031-0000-4000-8000-000000000000', 'sent');
select throws_ok($$
  insert into public.notice_batches (category, body, created_by) values ('policy_change', 'Hello there', 'e0000031-0000-4000-8000-000000000000')
$$, '23514', null, 'every notice starts with FleetGrid:');
insert into public.notice_batches (category, body, created_by, restores_batch_id)
values ('service_restored', 'FleetGrid: Logins are working again. Thanks for your patience. Reply STOP to opt out.',
  'e0000031-0000-4000-8000-000000000000', 'b0000001-0000-4000-8000-000000000000');
select throws_ok($$
  insert into public.notice_batches (category, body, created_by, restores_batch_id)
  values ('service_restored', 'FleetGrid: Logins are working again. Thanks for your patience. Reply STOP to opt out.',
    'e0000031-0000-4000-8000-000000000000', 'b0000001-0000-4000-8000-000000000000')
$$, '23505', null, 'one service restored per service notice');

insert into public.sms_messages (id, direction, kind, from_phone, to_phone, body, status, error_code)
values ('a0000001-0000-4000-8000-000000000000', 'outbound', 'notice', 'fake', '+15555559532', 'FleetGrid: x', 'failed', '30003');
insert into public.sms_messages (direction, kind, from_phone, to_phone, body, status, resend_of)
values ('outbound', 'notice', 'fake', '+15555559532', 'FleetGrid: x', 'sending', 'a0000001-0000-4000-8000-000000000000');
select throws_ok($$
  insert into public.sms_messages (direction, kind, from_phone, to_phone, body, status, resend_of)
  values ('outbound', 'notice', 'fake', '+15555559532', 'FleetGrid: x', 'sending', 'a0000001-0000-4000-8000-000000000000')
$$, '23505', null, 'a message is resent at most once');
select throws_ok($$
  insert into public.sms_messages (direction, kind, from_phone, to_phone, body, inbound_outcome) values ('inbound', 'inbound', 'x', 'y', 'hi', 'nonsense')
$$, '23514', null, 'the inbound outcome is one of the known ones');

-- Who reads the batches.
create function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;
select pg_temp.sign_in('e0000031-0000-4000-8000-000000000000');
select ok((select count(*) from public.notice_batches) >= 2, 'an admin reads the batches');
reset role;
select pg_temp.sign_in('e0000032-0000-4000-8000-000000000000');
select is((select count(*) from public.notice_batches), 0::bigint, 'a driver reads none');
reset role;
select pg_temp.sign_in('e0000037-0000-4000-8000-000000000000');
select is((select count(*) from public.notice_batches), 0::bigint, 'a carrier reads none');
select throws_ok($$ insert into public.notice_batches (category, body, created_by) values ('policy_change', 'FleetGrid: x', 'e0000037-0000-4000-8000-000000000000') $$,
  '42501', null, 'a carrier cannot write one');
reset role;

select * from finish();
rollback;
