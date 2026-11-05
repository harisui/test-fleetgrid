-- 0036: blocking a carrier ends their access at once, even with a session still valid, and pauses
-- their open shifts. Lifting the block lifts the pause. A booked shift is left alone.
begin;
select no_plan();

insert into auth.users (id, phone)
select ('e00000' || n || '-0000-4000-8000-000000000000')::uuid, '155555591' || n from unnest(array['41', '42']) as n;
insert into public.profiles (id, role, phone, status)
values ('e0000041-0000-4000-8000-000000000000', 'carrier', '+15555559141', 'approved'),
  ('e0000042-0000-4000-8000-000000000000', 'driver', '+15555559142', 'pending');
insert into public.drivers (id, profile_id, full_name, operator_types, cdl_class, cdl_state, endorsements,
  years_experience, city, state, zip, lat, lng, service_radius_miles, transmission, equipment_types,
  twic_active, medical_card_active, mvr_status, onboarding_step, card_completed, sms_opt_in, sms_opt_in_at, sms_opt_in_text)
values ('d0000042-0000-4000-8000-000000000000', 'e0000042-0000-4000-8000-000000000000', 'Block Driver', '{cdl_driver}', 'A', 'TX', '{H}', 8,
  'Houston', 'TX', '77002', 29.7594, -95.3594, 50, 'manual_ok', '{dry_van}', false, true, 'clean', 12, true, true, now(), 'consent');
insert into public.driver_documents (driver_id, type, storage_path, file_name, mime_type, size_bytes)
select 'd0000042-0000-4000-8000-000000000000', t::public.document_type, 'd0000042/' || t || '.png', t || '.png', 'image/png', 100
from unnest(array['cdl_front', 'cdl_back', 'medical_card']) as t;
update public.profiles set status = 'approved' where id = 'e0000042-0000-4000-8000-000000000000';
update public.drivers set rereview_needed = false where id = 'd0000042-0000-4000-8000-000000000000';

insert into public.carriers (id, profile_id, company_name, contact_name, billing_email, city, state, zip, lat, lng, stripe_customer_id)
values ('c0000041-0000-4000-a000-000000000000', 'e0000041-0000-4000-8000-000000000000', 'Block Freight', 'Sam Owner', 'sam@block.test', 'Houston', 'TX', '77002', 29.7594, -95.3594, 'cus_41');
insert into public.subscriptions (carrier_id, stripe_subscription_id, stripe_customer_id, status)
values ('c0000041-0000-4000-a000-000000000000', 'sub_41', 'cus_41', 'active');

create function pg_temp.shift(n text, st public.shift_status, driver uuid, hours integer) returns void language sql as $$
  insert into public.shifts (id, carrier_id, short_code, status, booked_driver_id, booked_at, starts_at, ends_at, zip, city, state, lat, lng,
    work_description, onsite_contact_name, onsite_contact_phone, broadcast_round)
  values (('700000' || n || '-0000-4000-8000-000000000000')::uuid, 'c0000041-0000-4000-a000-000000000000', '41' || n, st, driver,
    case when driver is not null then now() end, now() + make_interval(hours => hours), now() + make_interval(hours => hours + 8),
    '77002', 'Houston', 'TX', 29.7594, -95.3594, 'Yard moves for the check.', 'Lee Yard', '+17135550100', 1);
$$;
select pg_temp.shift('01', 'open', null, 24);
select pg_temp.shift('02', 'booked', 'd0000042-0000-4000-8000-000000000000', 72);
insert into public.broadcast_recipients (shift_id, driver_id, round, position, code, status)
values ('70000001-0000-4000-8000-000000000000', 'd0000042-0000-4000-8000-000000000000', 1, 1, '4101', 'sent');

select set_config('request.jwt.claims', json_build_object('sub', 'e0000041-0000-4000-8000-000000000000', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.drivers where id = 'd0000042-0000-4000-8000-000000000000'), 1, 'a subscribed carrier reads a listed driver');
reset role;

update public.profiles set status = 'blocked' where id = 'e0000041-0000-4000-8000-000000000000';

set local role authenticated;
select is((select count(*)::int from public.drivers where id = 'd0000042-0000-4000-8000-000000000000'), 0, 'blocked, with the session still valid: nothing');
reset role;
select ok((select carrier_paused_at is not null from public.shifts where id = '70000001-0000-4000-8000-000000000000'), 'the open shift is paused');
select is((select carrier_paused_at from public.shifts where id = '70000002-0000-4000-8000-000000000000'), null, 'a booked shift is left alone');
select is((select outcome from public.claim_shift('d0000042-0000-4000-8000-000000000000', '4101')), 'closed', 'a YES books nothing, and is told it is closed');
select is((select status::text from public.shifts where id = '70000001-0000-4000-8000-000000000000'), 'open', 'the shift stays open, paused');
select is_empty($$ select 1 from public.stale_queued_recipients(now() + interval '1 hour') where shift_id = '70000001-0000-4000-8000-000000000000' $$, 'and the job leaves its queue alone');

update public.profiles set status = 'approved' where id = 'e0000041-0000-4000-8000-000000000000';
set local role authenticated;
select is((select count(*)::int from public.drivers where id = 'd0000042-0000-4000-8000-000000000000'), 1, 'block lifted: access back');
reset role;
select is((select carrier_paused_at from public.shifts where id = '70000001-0000-4000-8000-000000000000'), null, 'and the pause goes');

select * from finish();
rollback;
